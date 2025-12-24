import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { put } from "@vercel/blob";

export const config = { maxDuration: 300 };

// DocAI has page limits; we chunk.
const DOCAI_MAX_PAGES_PER_CALL = 15;

// ---------- helpers ----------

function jsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body ?? {};
}

function ensureCreds() {
  const raw = process.env.GCP_SA_KEY_JSON;
  if (!raw) throw new Error("Missing env var: GCP_SA_KEY_JSON");

  // Some environments accidentally store base64. Support both.
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      obj = JSON.parse(decoded);
    } catch (e) {
      throw new Error(
        `GCP_SA_KEY_JSON is not valid JSON (or base64 JSON). ${e?.message || e}`
      );
    }
  }

  const tmp = path.join(os.tmpdir(), "gcp-sa.json");
  fs.writeFileSync(tmp, JSON.stringify(obj));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmp;

  const projectFromKey =
    obj.project_id || process.env.GCP_PROJECT_ID || process.env.GCP_PROJECT;
  return { tmp, projectFromKey };
}

function sha1(s) {
  return createHash("sha1").update(String(s)).digest("hex");
}

function pickProjectId(projectFromKey) {
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GCP_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    projectFromKey
  );
}

function cleanPrefixSegment(s) {
  return String(s || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function extractFromTextAnchor(fullText, anchor) {
  const segs = anchor?.textSegments || anchor?.text_segments || [];
  if (!segs.length) return "";
  let out = "";
  for (const seg of segs) {
    const start = Number(seg.startIndex ?? seg.start_index ?? 0);
    const end = Number(seg.endIndex ?? seg.end_index ?? 0);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      out += fullText.slice(start, end);
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function simpleKeywords(text, max = 12) {
  const t = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return [];
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "this",
    "that",
    "it",
    "as",
    "at",
    "by",
    "from",
    "into",
    "over",
    "after",
    "before",
    "then",
    "than",
    "but",
    "not",
    "no",
    "so",
    "if",
    "we",
    "you",
    "they",
    "he",
    "she",
    "i",
  ]);

  const freq = new Map();
  for (const w of t.split(" ")) {
    if (w.length < 3) continue;
    if (stop.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

async function processDocAI({ project, location, processorId, pdfBuf }) {
  const client = new documentai.DocumentProcessorServiceClient({
    apiEndpoint: `${location}-documentai.googleapis.com`,
  });

  const name = `projects/${project}/locations/${location}/processors/${processorId}`;

  const [result] = await client.processDocument({
    name,
    rawDocument: { content: pdfBuf, mimeType: "application/pdf" },
  });

  return result.document;
}

async function makeSubPdf(pdfBytes, start0, end0Exclusive) {
  const src = await PDFDocument.load(pdfBytes);
  const out = await PDFDocument.create();
  const indices = [];
  for (let i = start0; i < end0Exclusive; i++) indices.push(i);
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  return await out.save();
}

// ---------- handler ----------

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    const body = jsonBody(req);
    const pdfBlobUrl = body?.blobUrl;
    const projectId = cleanPrefixSegment(body?.projectId || "default");

    if (!pdfBlobUrl || typeof pdfBlobUrl !== "string") {
      res.status(400).json({ error: "Missing blobUrl" });
      return;
    }

    const { projectFromKey } = ensureCreds();

    const location = process.env.DOCAI_LOCATION || "us";
    const processorId = process.env.DOCAI_PROCESSOR_ID;
    if (!processorId) throw new Error("Missing env var: DOCAI_PROCESSOR_ID");

    const project = pickProjectId(projectFromKey);
    if (!project) throw new Error("Missing GCP project id (GCP_PROJECT_ID)");

    // Deterministic ingestion id = same pdfBlobUrl -> same folder
    const ingestionId = cleanPrefixSegment(body?.ingestionId || sha1(pdfBlobUrl));
    const prefix = `projects/${projectId}/ingestions/${ingestionId}`;

    // Fetch PDF bytes from Blob
    const r = await fetch(pdfBlobUrl);
    if (!r.ok) {
      res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
      return;
    }
    const pdfBytes = new Uint8Array(await r.arrayBuffer());

    // Page count
    const pdf = await PDFDocument.load(pdfBytes);
    const pageCount = pdf.getPageCount();

    // Per-page outputs
    const pages = [];
    const tagsPages = [];

    let fullTextParts = [];

    // Chunk through DocAI
    let globalPageIndex = 0;
    for (let start = 0; start < pageCount; start += DOCAI_MAX_PAGES_PER_CALL) {
      const end = Math.min(pageCount, start + DOCAI_MAX_PAGES_PER_CALL);
      const subPdfBytes = await makeSubPdf(pdfBytes, start, end);

      const doc = await processDocAI({
        project,
        location,
        processorId,
        pdfBuf: subPdfBytes,
      });

      const fullText = doc?.text || "";
      if (fullText) fullTextParts.push(fullText);

      const docPages = doc?.pages || [];
      for (let i = 0; i < docPages.length; i++) {
        const pageNum1 = start + i + 1; // 1-based in final doc
        const page = docPages[i];

        // --- image (force PNG) ---
        const raw = page?.image?.content;
        let rawBuf = null;
        if (raw) {
          if (typeof raw === "string") rawBuf = Buffer.from(raw, "base64");
          else rawBuf = Buffer.from(raw);
        }

        let imageUrl = null;
        let width = 0;
        let height = 0;

        if (rawBuf && rawBuf.length > 0) {
          // convert to PNG ALWAYS
          const pngBuf = await sharp(rawBuf).png().toBuffer();
          const meta = await sharp(pngBuf).metadata();
          width = Number(meta.width || 0);
          height = Number(meta.height || 0);

          const key = `${prefix}/pages/page-${String(pageNum1).padStart(3, "0")}.png`;
          const putRes = await put(key, pngBuf, {
            access: "public",
            contentType: "image/png",
          });

          imageUrl = putRes.url;
        }

        // --- per-page text ---
        const pageText =
          extractFromTextAnchor(fullText, page?.layout?.textAnchor) || "";

        const pageTextKey = `${prefix}/pages/page-${String(pageNum1).padStart(
          3,
          "0"
        )}.txt`;
        const pageTextPut = await put(pageTextKey, Buffer.from(pageText, "utf-8"), {
          access: "public",
          contentType: "text/plain; charset=utf-8",
        });

        // --- tags stub (replaceable later) ---
        const keywords = simpleKeywords(pageText, 12);
        tagsPages.push({ page: pageNum1, keywords });

        pages.push({
          page: pageNum1,
          imageUrl,
          width,
          height,
          pageTextUrl: pageTextPut.url,
        });

        globalPageIndex++;
      }
    }

    // store full text
    const fullTextJoined = fullTextParts.join("\n\n").trim();
    const fullTextKey = `${prefix}/fullText.txt`;
    const fullTextPut = await put(fullTextKey, Buffer.from(fullTextJoined, "utf-8"), {
      access: "public",
      contentType: "text/plain; charset=utf-8",
    });

    // store tags
    const tagsObj = {
      version: 1,
      projectId,
      ingestionId,
      pdfBlobUrl,
      pageCount,
      pages: tagsPages,
      note: "Simple keyword tags (placeholder). Swap later via Settings tab.",
    };
    const tagsKey = `${prefix}/tags.json`;
    const tagsPut = await put(tagsKey, Buffer.from(JSON.stringify(tagsObj, null, 2)), {
      access: "public",
      contentType: "application/json",
    });

    // store manifest (single source of truth)
    const manifest = {
      version: 1,
      projectId,
      ingestionId,
      createdAt: new Date().toISOString(),
      pdfBlobUrl,
      pageCount,
      fullTextUrl: fullTextPut.url,
      tagsUrl: tagsPut.url,
      pages,
    };

    const manifestKey = `${prefix}/manifest.json`;
    const manifestPut = await put(
      manifestKey,
      Buffer.from(JSON.stringify(manifest, null, 2)),
      { access: "public", contentType: "application/json" }
    );

    res.status(200).json({
      ok: true,
      projectId,
      ingestionId,
      prefix,
      pdfBlobUrl,
      pageCount,
      manifestUrl: manifestPut.url,
      fullTextUrl: fullTextPut.url,
      tagsUrl: tagsPut.url,
      pageImagesCount: pages.filter((p) => !!p.imageUrl).length,
      pages,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

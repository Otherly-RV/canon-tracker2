// api/pdf-render.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";
import { put } from "@vercel/blob";

export const config = { maxDuration: 300 };

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function readJsonBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body ?? {};
}

function writeCredsToTmp() {
  // Use your single env var JSON (same as extractor app)
  const raw = need("GCP_SA_KEY_JSON");
  const fixed = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  const p = path.join(os.tmpdir(), "gcp-sa.json");
  fs.writeFileSync(p, fixed, "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function mimeToExt(mimeType) {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  return "png";
}

async function docaiProcessPdfBytes({ projectId, location, processorId, pdfBytes }) {
  const client = new documentai.DocumentProcessorServiceClient({
    apiEndpoint: `${location}-documentai.googleapis.com`,
  });

  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  const [result] = await client.processDocument({
    name,
    rawDocument: {
      content: Buffer.from(pdfBytes).toString("base64"),
      mimeType: "application/pdf",
    },
  });

  const doc = result?.document;
  if (!doc) throw new Error("DocAI returned no document");
  return doc;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    writeCredsToTmp();

    const projectId = need("GCP_PROJECT_ID");
    const location = need("DOCAI_LOCATION");
    const processorId = need("DOCAI_PROCESSOR_ID");

    const body = readJsonBody(req);

    const blobUrl = body?.blobUrl;
    const prefix = body?.prefix || `docai-pages/${Date.now()}`;

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    // Requested page range (1-indexed)
    const reqStart = body?.startPage ?? 1;
    const reqEnd = body?.endPage ?? 1;

    // 1) Download source PDF from blob
    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }
    const srcBuf = Buffer.from(await r.arrayBuffer());

    // 2) Split range with pdf-lib
    const src = await PDFDocument.load(srcBuf);
    const totalPages = src.getPageCount();

    const startPage = clampInt(reqStart, 1, totalPages);
    const endPage = clampInt(reqEnd, startPage, totalPages);

    const chunk = await PDFDocument.create();
    const indices = Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage - 1 + i
    );
    const copied = await chunk.copyPages(src, indices);
    copied.forEach((p) => chunk.addPage(p));
    const chunkBytes = await chunk.save();

    // 3) DocAI on that chunk
    const doc = await docaiProcessPdfBytes({
      projectId,
      location,
      processorId,
      pdfBytes: chunkBytes,
    });

    // 4) Upload page images returned by DocAI
    const pageImages = [];
    const pages = doc.pages || [];

    for (let i = 0; i < pages.length; i++) {
      const globalPage = startPage + i;

      const img = pages[i]?.image;
      const content = img?.content;
      const mimeType = img?.mimeType || "image/png";

      // IMPORTANT: if content is missing, your processor does NOT return images
      if (!content) continue;

      const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
      const ext = mimeToExt(mimeType);

      const key = `${prefix}/page-${String(globalPage).padStart(3, "0")}.${ext}`;

      const blob = await put(key, bytes, {
        access: "public",
        contentType: mimeType,
      });

      pageImages.push({
        page: globalPage,
        imageUrl: blob.url,
        width: img?.width || 0,
        height: img?.height || 0,
        source: "docai",
      });
    }

    return res.status(200).json({
      ok: true,
      pageCount: totalPages,
      startPage,
      endPage,
      pageImages,
      hasPageImages: pageImages.length > 0,
      note: pageImages.length
        ? "Images returned by DocAI and uploaded to Blob."
        : "DocAI returned no page.image.content for this processor/PDF.",
    });
  } catch (e) {
    console.error("pdf-render (docai) error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

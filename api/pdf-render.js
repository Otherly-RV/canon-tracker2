// api/pdf-render.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";
import { put } from "@vercel/blob";

export const config = { maxDuration: 300 };
const DOCAI_PAGES_PER_CALL = 15;

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

function writeCredentialsFileFromEnv() {
  const raw = need("GCP_SA_KEY_JSON");
  const fixed = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;

  const credPath = path.join(os.tmpdir(), "gcp-sa.json");
  fs.writeFileSync(credPath, fixed, "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
}

function makeDocAIClient() {
  writeCredentialsFileFromEnv();
  const location = need("DOCAI_LOCATION");
  return new documentai.DocumentProcessorServiceClient({
    apiEndpoint: `${location}-documentai.googleapis.com`,
  });
}

function mimeToExt(mimeType) {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  return "png";
}

async function docaiProcessPdfBytes({ client, projectId, location, processorId, pdfBytes }) {
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
    const projectId = need("GCP_PROJECT_ID");
    const location = need("DOCAI_LOCATION");
    const processorId = need("DOCAI_PROCESSOR_ID");

    const client = makeDocAIClient();

    const body = readJsonBody(req);
    const blobUrl = body?.blobUrl;
    const prefix = body?.prefix || `docai-pages/${Date.now()}`;

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    const r = await fetch(blobUrl);
    if (!r.ok) return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    const pdfBuf = Buffer.from(await r.arrayBuffer());

    const src = await PDFDocument.load(pdfBuf);
    const totalPages = src.getPageCount();

    const pageImages = [];
    let imagesMissingCount = 0;

    for (let start = 0; start < totalPages; start += DOCAI_PAGES_PER_CALL) {
      const end = Math.min(totalPages, start + DOCAI_PAGES_PER_CALL);

      const chunk = await PDFDocument.create();
      const indices = Array.from({ length: end - start }, (_, i) => start + i);
      const copied = await chunk.copyPages(src, indices);
      copied.forEach((p) => chunk.addPage(p));
      const chunkBytes = await chunk.save();

      const doc = await docaiProcessPdfBytes({
        client,
        projectId,
        location,
        processorId,
        pdfBytes: chunkBytes,
      });

      const pages = doc.pages || [];
      for (let i = 0; i < pages.length; i++) {
        const globalPage = start + 1 + i;

        const img = pages[i]?.image;
        const content = img?.content;
        const mimeType = img?.mimeType || "image/png";

        if (!content) {
          imagesMissingCount += 1;
          continue;
        }

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
    }

    return res.status(200).json({
      ok: true,
      pageCount: totalPages,
      pageImages,
      hasPageImages: pageImages.length > 0,
      imagesMissingCount,
    });
  } catch (e) {
    console.error("pdf-render error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";
import { put } from "@vercel/blob";

export const config = { maxDuration: 300 };

const DOCAI_MAX_PAGES_PER_CALL = 15;

function ensureCreds() {
  const json = process.env.GCP_SA_KEY_JSON;
  if (!json) throw new Error("Missing env var: GCP_SA_KEY_JSON");

  const p = path.join(os.tmpdir(), "gcp-sa.json");
  fs.writeFileSync(p, json, "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
}

function mimeToExt(mime) {
  if (!mime) return "png";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
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

  const doc = result.document;
  if (!doc) throw new Error("Document AI returned no document");
  return doc;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    ensureCreds();

    const project = process.env.GCP_PROJECT_ID;
    const location = process.env.DOCAI_LOCATION;
    const processorId = process.env.DOCAI_PROCESSOR_ID;

    if (!project) return res.status(500).json({ error: "Missing env var: GCP_PROJECT_ID" });
    if (!location) return res.status(500).json({ error: "Missing env var: DOCAI_LOCATION" });
    if (!processorId) return res.status(500).json({ error: "Missing env var: DOCAI_PROCESSOR_ID" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    const blobUrl = body?.blobUrl;
    const prefix = body?.prefix || `pdf-pages/${Date.now()}`;

    if (!blobUrl || typeof blobUrl !== "string") {
      res.status(400).json({ error: "Missing blobUrl" });
      return;
    }

    // 1) Download PDF from Blob
    const r = await fetch(blobUrl);
    if (!r.ok) {
      res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
      return;
    }

    const pdfBuf = Buffer.from(await r.arrayBuffer());

    // 2) Chunk PDF so DocAI doesn’t choke on large docs
    const src = await PDFDocument.load(pdfBuf);
    const totalPages = src.getPageCount();

    const pageImages = [];
    const textParts = [];

    let globalPage = 0;

    for (let start = 0; start < totalPages; start += DOCAI_MAX_PAGES_PER_CALL) {
      const end = Math.min(totalPages, start + DOCAI_MAX_PAGES_PER_CALL);

      // build chunk pdf
      const chunk = await PDFDocument.create();
      const copied = await chunk.copyPages(
        src,
        Array.from({ length: end - start }, (_, i) => start + i)
      );
      copied.forEach((p) => chunk.addPage(p));

      const chunkBytes = await chunk.save();
      const doc = await processDocAI({
        project,
        location,
        processorId,
        pdfBuf: Buffer.from(chunkBytes),
      });

      if (doc.text) textParts.push(doc.text);

      const pages = doc.pages || [];
      for (let i = 0; i < pages.length; i++) {
        globalPage += 1;

        const img = pages[i]?.image;
        if (!img?.content) continue;

        // Document AI may provide a mimeType on the image; if not, assume png.
        const mimeType = img?.mimeType || "image/png";
        const ext = mimeToExt(mimeType);

        const raw = Buffer.isBuffer(img.content) ? img.content : Buffer.from(img.content);

        const key = `${prefix}/page-${String(globalPage).padStart(3, "0")}.${ext}`;
        const blob = await put(key, raw, {
          access: "public",
          contentType: mimeType,
        });

        pageImages.push({
          page: globalPage,
          imageUrl: blob.url,
          width: 0,
          height: 0,
        });
      }
    }

    res.status(200).json({
      ok: true,
      fullText: textParts.join("\n\n"),
      pageImages,
      pagesWithImages: pageImages.length,
      pageCount: totalPages,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

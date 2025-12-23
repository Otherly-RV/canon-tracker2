import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { put } from "@vercel/blob";

export const config = { maxDuration: 300 };

const DOCAI_MAX_PAGES_PER_CALL = 15;
const UI_MAX_W = 1200;

function ensureCreds() {
  const json = process.env.GCP_SA_KEY_JSON;
  if (!json) throw new Error("Missing env var: GCP_SA_KEY_JSON");
  const p = path.join(os.tmpdir(), "gcp-sa.json");
  fs.writeFileSync(p, json, "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
}

async function normalizeForUi(input: Buffer) {
  const img = sharp(input);
  const meta = await img.metadata();
  const w = meta.width ?? UI_MAX_W;

  const resized = w > UI_MAX_W ? img.resize({ width: UI_MAX_W, withoutEnlargement: true }) : img;
  const png = await resized.png({ compressionLevel: 8 }).toBuffer();
  const outMeta = await sharp(png).metadata();

  return { buf: png, width: outMeta.width ?? 0, height: outMeta.height ?? 0 };
}

async function processDocAIChunk(params: {
  project: string;
  location: string;
  processorId: string;
  pdfBuf: Buffer;
}) {
  const { project, location, processorId, pdfBuf } = params;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    ensureCreds();

    const project = process.env.GCP_PROJECT_ID;
    const location = process.env.DOCAI_LOCATION;
    const processorId = process.env.DOCAI_PROCESSOR_ID;

    if (!project) return res.status(500).json({ error: "Missing GCP_PROJECT_ID" });
    if (!location) return res.status(500).json({ error: "Missing DOCAI_LOCATION" });
    if (!processorId) return res.status(500).json({ error: "Missing DOCAI_PROCESSOR_ID" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const blobUrl = String(body?.blobUrl || "");
    const prefix = String(body?.prefix || `pdf-pages/${Date.now()}`);

    if (!blobUrl) return res.status(400).json({ error: "Missing blobUrl" });

    const r = await fetch(blobUrl);
    if (!r.ok) return res.status(400).json({ error: `Failed to download blob (${r.status})` });

    const pdfBuf = Buffer.from(await r.arrayBuffer());

    // split PDF into chunks (same reason as your test: DocAI image mode limit)
    const src = await PDFDocument.load(pdfBuf);
    const total = src.getPageCount();

    const pageImages: Array<{ page: number; imageUrl: string; width: number; height: number }> = [];
    const textParts: string[] = [];

    let globalPageIndex = 0;

    for (let start = 0; start < total; start += DOCAI_MAX_PAGES_PER_CALL) {
      const end = Math.min(total, start + DOCAI_MAX_PAGES_PER_CALL);

      const chunk = await PDFDocument.create();
      const copied = await chunk.copyPages(
        src,
        Array.from({ length: end - start }, (_, i) => start + i)
      );
      copied.forEach((p) => chunk.addPage(p));

      const chunkBytes = await chunk.save();
      const doc = await processDocAIChunk({
        project,
        location,
        processorId,
        pdfBuf: Buffer.from(chunkBytes),
      });

      if (doc.text) textParts.push(doc.text);

      const pages = doc.pages || [];
      for (let i = 0; i < pages.length; i++) {
        globalPageIndex += 1;

        const img = pages[i]?.image;
        if (!img?.content) continue;

        const rawBuf = Buffer.isBuffer(img.content) ? (img.content as Buffer) : Buffer.from(img.content as any);
        const { buf, width, height } = await normalizeForUi(rawBuf);

        const key = `${prefix}/page-${String(globalPageIndex).padStart(3, "0")}.png`;
        const blob = await put(key, buf, { access: "public", contentType: "image/png" });

        pageImages.push({ page: globalPageIndex, imageUrl: blob.url, width, height });
      }
    }

    return res.status(200).json({
      ok: true,
      fullText: textParts.join("\n\n"),
      pageImages,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

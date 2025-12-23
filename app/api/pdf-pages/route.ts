import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 300;

// DocAI image mode safety (same pattern as your test)
const DOCAI_MAX_PAGES_PER_CALL = 15;

// Reasonable UI size (keeps Blob + UI fast)
const UI_MAX_W = 1200;

function ensureCreds() {
  const json = process.env.GCP_SA_KEY_JSON;
  if (!json) throw new Error("Missing env var: GCP_SA_KEY_JSON");
  const p = path.join(os.tmpdir(), "gcp-sa.json");
  fs.writeFileSync(p, json, "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
}

async function processWithDocAIInChunks(params: {
  project: string;
  docaiLocation: string;
  processorId: string;
  pdfBuf: Buffer;
}) {
  const { project, docaiLocation, processorId, pdfBuf } = params;

  const client = new documentai.DocumentProcessorServiceClient({
    apiEndpoint: `${docaiLocation}-documentai.googleapis.com`,
  });

  const name = `projects/${project}/locations/${docaiLocation}/processors/${processorId}`;

  const src = await PDFDocument.load(pdfBuf);
  const total = src.getPageCount();

  const allTexts: string[] = [];
  const allPages: any[] = [];

  for (let start = 0; start < total; start += DOCAI_MAX_PAGES_PER_CALL) {
    const end = Math.min(total, start + DOCAI_MAX_PAGES_PER_CALL);

    const chunk = await PDFDocument.create();
    const copied = await chunk.copyPages(
      src,
      Array.from({ length: end - start }, (_, i) => start + i)
    );
    copied.forEach((p) => chunk.addPage(p));

    const chunkBytes = await chunk.save();
    const chunkBuf = Buffer.from(chunkBytes);

    const [result] = await client.processDocument({
      name,
      rawDocument: { content: chunkBuf, mimeType: "application/pdf" },
    });

    const doc = result.document;
    if (!doc) throw new Error("Document AI returned no document (chunk)");

    allTexts.push(doc.text || "");
    const pages = doc.pages || [];
    for (const p of pages) allPages.push(p);
  }

  return {
    fullText: allTexts.join("\n\n"),
    pages: allPages,
  };
}

async function normalizeForUi(input: Buffer) {
  // Make sure we output PNG; resize if very large
  const img = sharp(input);
  const meta = await img.metadata();

  const w = meta.width ?? UI_MAX_W;
  const resized =
    w > UI_MAX_W ? img.resize({ width: UI_MAX_W, withoutEnlargement: true }) : img;

  const png = await resized.png({ compressionLevel: 8 }).toBuffer();
  const outMeta = await sharp(png).metadata();

  return {
    buf: png,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
  };
}

export async function POST(req: Request) {
  try {
    ensureCreds();

    const project = process.env.GCP_PROJECT_ID!;
    const docaiLocation = process.env.DOCAI_LOCATION!;
    const processorId = process.env.DOCAI_PROCESSOR_ID!;

    if (!project) return Response.json({ error: "Missing GCP_PROJECT_ID" }, { status: 500 });
    if (!docaiLocation || !processorId) {
      return Response.json({ error: "Missing DOCAI_LOCATION or DOCAI_PROCESSOR_ID" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const blobUrl = String(body?.blobUrl || "");
    const prefix = String(body?.prefix || "pdf-pages");

    if (!blobUrl) return Response.json({ error: "Missing blobUrl" }, { status: 400 });

    const r = await fetch(blobUrl);
    if (!r.ok) {
      const t = await r.text();
      return Response.json({ error: `Failed to download blob: ${r.status} ${t}` }, { status: 400 });
    }

    const pdfBuf = Buffer.from(await r.arrayBuffer());

    const { fullText, pages } = await processWithDocAIInChunks({
      project,
      docaiLocation,
      processorId,
      pdfBuf,
    });

    // Extract page images if present
    const outPages: Array<{ page: number; imageUrl: string; width: number; height: number }> = [];

    for (let i = 0; i < pages.length; i++) {
      const pageIndex1 = i + 1;
      const img = pages[i]?.image;
      if (!img?.content) continue;

      const rawBuf = Buffer.isBuffer(img.content)
        ? (img.content as Buffer)
        : Buffer.from(img.content as any);

      const { buf, width, height } = await normalizeForUi(rawBuf);

      const key = `${prefix}/page-${String(pageIndex1).padStart(3, "0")}.png`;
      const blob = await put(key, buf, { access: "public", contentType: "image/png" });

      outPages.push({ page: pageIndex1, imageUrl: blob.url, width, height });
    }

    return Response.json({
      ok: true,
      fullText,
      pageImages: outPages,
      pagesWithImages: outPages.length,
    });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

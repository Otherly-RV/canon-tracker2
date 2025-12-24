// api/pdf-pages.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";

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
  // DO NOT JSON.parse this. Just write it to a temp json file.
  // If Vercel stored \n literally as two chars, convert them to real newlines.
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

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    const r = await fetch(blobUrl);
    if (!r.ok) return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    const pdfBuf = Buffer.from(await r.arrayBuffer());

    const src = await PDFDocument.load(pdfBuf);
    const totalPages = src.getPageCount();

    const textParts = [];
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

      if (doc.text) textParts.push(doc.text);
    }

    return res.status(200).json({
      ok: true,
      pageCount: totalPages,
      fullText: textParts.join("\n\n"),
    });
  } catch (e) {
    console.error("pdf-pages error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

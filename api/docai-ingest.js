// api/docai-ingest.js
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

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

function parseSaJson(raw) {
  // Vercel often stores JSON with escaped newlines
  const fixed = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  return JSON.parse(fixed);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body = readJsonBody(req);
    const blobUrl = body?.blobUrl;

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    const projectId = need("GCP_PROJECT_ID");
    const location = need("DOCAI_LOCATION");
    const processorId = need("DOCAI_PROCESSOR_ID");
    const sa = parseSaJson(need("GCP_SA_KEY_JSON"));

    // 1) Fetch PDF bytes (from Vercel Blob URL)
    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }
    const pdfBytes = new Uint8Array(await r.arrayBuffer());

    // 2) DocAI client using SA JSON (same as your extractor app)
    const client = new DocumentProcessorServiceClient({
      credentials: {
        client_email: sa.client_email,
        private_key: sa.private_key,
      },
      projectId,
    });

    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

    // 3) Process PDF
    const [result] = await client.processDocument({
      name,
      rawDocument: {
        content: Buffer.from(pdfBytes).toString("base64"),
        mimeType: "application/pdf",
      },
    });

    const doc = result?.document;
    const fullText = doc?.text || "";
    const pageCount = Array.isArray(doc?.pages) ? doc.pages.length : 0;

    // NOTE: Most DocAI processors do NOT return page image bytes here.
    // Your “page PNGs” should be generated separately (we’ll do that next),
    // but text + layout are correct here.
    return res.status(200).json({
      ok: true,
      pageCount,
      fullText,
    });
  } catch (e) {
    console.error("docai-ingest error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

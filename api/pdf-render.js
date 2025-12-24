// api/pdf-render.js
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

function parseServiceAccountEnv() {
  const raw0 = need("GCP_SA_KEY_JSON");
  const raw = raw0.replace(/\r\n/g, "\n");

  try {
    const obj = JSON.parse(raw);
    if (!obj?.client_email || !obj?.private_key) throw new Error("Missing fields.");
    return obj;
  } catch {
    // continue
  }

  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    const unquoted = raw.slice(1, -1);
    try {
      const obj = JSON.parse(unquoted);
      if (!obj?.client_email || !obj?.private_key) throw new Error("Missing fields.");
      return obj;
    } catch {
      // continue
    }
  }

  const keyIdx = raw.indexOf('"private_key"');
  if (keyIdx === -1) {
    throw new Error(
      'GCP_SA_KEY_JSON is not valid JSON and does not contain "private_key". Make sure it is the FULL service account JSON.'
    );
  }

  const colon = raw.indexOf(":", keyIdx);
  const openQuote = raw.indexOf('"', colon + 1);
  const endMarker = "-----END PRIVATE KEY-----";
  const endMarkerIdx = raw.indexOf(endMarker, openQuote + 1);
  const closeQuote = raw.indexOf('"', endMarkerIdx + endMarker.length);

  if (colon === -1 || openQuote === -1 || endMarkerIdx === -1 || closeQuote === -1) {
    throw new Error(
      "Could not repair GCP_SA_KEY_JSON. Re-paste the original downloaded service account JSON into Vercel."
    );
  }

  const keyValueRaw = raw.slice(openQuote + 1, closeQuote);
  const keyValueEscaped = keyValueRaw
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

  const repaired =
    raw.slice(0, openQuote + 1) + keyValueEscaped + raw.slice(closeQuote);

  try {
    const obj = JSON.parse(repaired);
    if (!obj?.client_email || !obj?.private_key) throw new Error("Missing fields.");
    return obj;
  } catch (e) {
    throw new Error(
      `GCP_SA_KEY_JSON still not valid after repair. Parse error: ${e?.message || e}`
    );
  }
}

function makeDocAIClient() {
  const sa = parseServiceAccountEnv();
  const location = need("DOCAI_LOCATION");

  return new documentai.DocumentProcessorServiceClient({
    apiEndpoint: `${location}-documentai.googleapis.com`,
    credentials: {
      client_email: sa.client_email,
      private_key: sa.private_key,
    },
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
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }
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

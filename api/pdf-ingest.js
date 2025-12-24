// api/pdf-ingest.js
import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";
import { put } from "@vercel/blob";

export const config = { maxDuration: 300 };

// Internal chunk sizes
const DOCAI_TEXT_PAGES_PER_CALL = 15;
const DOCAI_IMAGE_PAGES_PER_CALL = 15;

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

/**
 * Your GCP_SA_KEY_JSON is not valid JSON as pasted (private_key newlines).
 * This parser repairs ONLY the private_key value so we can create a credentials object.
 */
function parseServiceAccountEnv() {
  const raw0 = need("GCP_SA_KEY_JSON");
  const raw = raw0.replace(/\r\n/g, "\n");

  // Try direct parse first
  try {
    const obj = JSON.parse(raw);
    if (!obj?.client_email || !obj?.private_key) throw new Error("Missing fields.");
    return obj;
  } catch {
    // continue
  }

  // Try if env is double-quoted JSON string
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

  // Repair private_key newlines (literal newlines inside JSON string)
  const keyIdx = raw.indexOf('"private_key"');
  if (keyIdx === -1) {
    throw new Error(
      'GCP_SA_KEY_JSON is not valid JSON and does not contain "private_key". Paste the FULL service account JSON (not only the key).'
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

  // Escape backslashes, quotes, and newlines so JSON becomes valid
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

function mimeToExt(mimeType) {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  return "png";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const projectId = need("GCP_PROJECT_ID");
    const location = need("DOCAI_LOCATION");
    const processorId = need("DOCAI_PROCESSOR_ID");

    const body = readJsonBody(req);
    const blobUrl = body?.blobUrl;

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    const client = makeDocAIClient();

    // Fetch PDF bytes from Blob
    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }
    const pdfBuf = Buffer.from(await r.arrayBuffer());

    // Count pages
    const src = await PDFDocument.load(pdfBuf);
    const totalPages = src.getPageCount();

    // Ingestion id + blob prefix
    const ingestId = `ingest-${Date.now()}`;
    const prefix = `otherly/${ingestId}`;

    // -------------------------
    // 1) TEXT extraction (chunked)
    // -------------------------
    const textParts = [];
    for (let start = 0; start < totalPages; start += DOCAI_TEXT_PAGES_PER_CALL) {
      const end = Math.min(totalPages, start + DOCAI_TEXT_PAGES_PER_CALL);

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

    const fullText = textParts.join("\n\n");

    // Store full text in Blob
    const textBlob = await put(`${prefix}/fullText.txt`, fullText, {
      access: "public",
      contentType: "text/plain; charset=utf-8",
    });

    // -------------------------
    // 2) PAGE IMAGES (DocAI pages[].image) -> Blob
    // -------------------------
    const pageImages = [];
    let imagesMissingCount = 0;

    for (let start = 0; start < totalPages; start += DOCAI_IMAGE_PAGES_PER_CALL) {
      const end = Math.min(totalPages, start + DOCAI_IMAGE_PAGES_PER_CALL);

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

        const key = `${prefix}/pages/page-${String(globalPage).padStart(3, "0")}.${ext}`;
        const blob = await put(key, bytes, {
          access: "public",
          contentType: mimeType,
        });

        pageImages.push({
          page: globalPage,
          imageUrl: blob.url,
          width: img?.width || 0,
          height: img?.height || 0,
          mimeType,
          source: "docai",
        });
      }
    }

    // -------------------------
    // 3) Placeholders for tags/segments (NEXT STEP)
    // -------------------------
    const textSegments = []; // next step: segment + meta tags
    const imageTags = []; // next step: tag each page image

    // -------------------------
    // 4) Store MANIFEST (single source of truth for ingest)
    // -------------------------
    const manifest = {
      ok: true,
      ingestId,
      createdAt: new Date().toISOString(),
      pdf: { blobUrl, pageCount: totalPages },
      text: { fullTextUrl: textBlob.url },
      images: {
        pageImages,
        imagesMissingCount,
      },
      segments: textSegments,
      imageTags,
    };

    const manifestBlob = await put(`${prefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
      access: "public",
      contentType: "application/json; charset=utf-8",
    });

    return res.status(200).json({
      ok: true,
      ingestId,
      pageCount: totalPages,
      fullTextUrl: textBlob.url,
      pageImagesCount: pageImages.length,
      imagesMissingCount,
      manifestUrl: manifestBlob.url,
    });
  } catch (e) {
    console.error("pdf-ingest error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

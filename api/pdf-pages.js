// api/pdf-pages.js
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

/**
 * Your env var is supposed to be a JSON object string (service account).
 * In practice, people paste a JSON where private_key contains literal newlines
 * (invalid JSON). This function repairs that and returns a parsed object.
 */
function parseServiceAccountEnv() {
  const raw0 = need("GCP_SA_KEY_JSON");

  // Normalize line endings first
  const raw = raw0.replace(/\r\n/g, "\n");

  // Case A: it is already valid JSON
  try {
    const obj = JSON.parse(raw);
    if (!obj?.client_email || !obj?.private_key) {
      throw new Error("Missing client_email/private_key inside parsed JSON.");
    }
    return obj;
  } catch {
    // keep going, try to repair
  }

  // Case B: it may be a quoted JSON string (double-encoded)
  // Example: "\"{\\\"type\\\":...}\""
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    const unquoted = raw.slice(1, -1);
    try {
      const obj = JSON.parse(unquoted);
      if (!obj?.client_email || !obj?.private_key) {
        throw new Error("Missing client_email/private_key inside parsed JSON.");
      }
      return obj;
    } catch {
      // ignore and try repair strategy below
    }
  }

  // Case C: JSON is invalid because private_key contains literal newlines.
  // Repair ONLY the private_key value by escaping newlines into \\n.
  const keyIdx = raw.indexOf('"private_key"');
  if (keyIdx === -1) {
    throw new Error(
      'GCP_SA_KEY_JSON is not valid JSON and does not contain "private_key". Make sure it is the FULL service account JSON, not only the PEM key.'
    );
  }

  const colon = raw.indexOf(":", keyIdx);
  if (colon === -1) throw new Error("Malformed JSON near private_key (no colon).");

  // find the opening quote of the value
  const openQuote = raw.indexOf('"', colon + 1);
  if (openQuote === -1) throw new Error("Malformed JSON near private_key (no opening quote).");

  // find end marker in the key block, then closing quote after it
  const endMarker = "-----END PRIVATE KEY-----";
  const endMarkerIdx = raw.indexOf(endMarker, openQuote + 1);
  if (endMarkerIdx === -1) {
    throw new Error(
      'Could not find "-----END PRIVATE KEY-----" while repairing private_key. Your env var value is corrupted. Re-paste the original service account JSON from Google.'
    );
  }

  const closeQuote = raw.indexOf('"', endMarkerIdx + endMarker.length);
  if (closeQuote === -1) throw new Error("Malformed JSON near private_key (no closing quote).");

  const keyValueRaw = raw.slice(openQuote + 1, closeQuote);

  // Escape backslashes first, then quotes, then newlines
  const keyValueEscaped = keyValueRaw
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

  const repaired =
    raw.slice(0, openQuote + 1) + keyValueEscaped + raw.slice(closeQuote);

  try {
    const obj = JSON.parse(repaired);
    if (!obj?.client_email || !obj?.private_key) {
      throw new Error("Missing client_email/private_key after repair.");
    }
    return obj;
  } catch (e) {
    throw new Error(
      `GCP_SA_KEY_JSON still not valid after repair. You must re-save it in Vercel using the ORIGINAL downloaded JSON file. Parse error: ${e?.message || e}`
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
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }
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

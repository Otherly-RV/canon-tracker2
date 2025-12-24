// api/pdf-ingest.js
import { v1 as documentai } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";

export const config = { maxDuration: 300 };

// Chunk size: DocAI calls per N pages
const DOCAI_PAGES_PER_CALL = 12;
// Tagging batch size: Gemini request per N pages
const TAG_BATCH_SIZE = 6;

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function opt(name) {
  const v = process.env[name];
  return v || null;
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
 * Fix common Vercel env paste issues:
 * - private_key has literal newlines inside JSON -> invalid JSON
 * This repairs ONLY private_key, then parses.
 */
function parseServiceAccountEnv() {
  const raw0 = need("GCP_SA_KEY_JSON");
  const raw = raw0.replace(/\r\n/g, "\n");

  // A) already valid JSON
  try {
    const obj = JSON.parse(raw);
    if (!obj?.client_email || !obj?.private_key) throw new Error("Missing fields.");
    return obj;
  } catch {
    // continue
  }

  // B) double-quoted JSON string
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

  // C) repair private_key
  const keyIdx = raw.indexOf('"private_key"');
  if (keyIdx === -1) {
    throw new Error(
      'GCP_SA_KEY_JSON is not valid JSON and does not contain "private_key". Paste the FULL service account JSON.'
    );
  }

  const colon = raw.indexOf(":", keyIdx);
  const openQuote = raw.indexOf('"', colon + 1);

  const endMarker = "-----END PRIVATE KEY-----";
  const endMarkerIdx = raw.indexOf(endMarker, openQuote + 1);
  const closeQuote = raw.indexOf('"', endMarkerIdx + endMarker.length);

  if (colon === -1 || openQuote === -1 || endMarkerIdx === -1 || closeQuote === -1) {
    throw new Error("Could not repair GCP_SA_KEY_JSON. Re-paste the original JSON.");
  }

  const keyValueRaw = raw.slice(openQuote + 1, closeQuote);
  const keyValueEscaped = keyValueRaw
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

  const repaired =
    raw.slice(0, openQuote + 1) + keyValueEscaped + raw.slice(closeQuote);

  const obj = JSON.parse(repaired);
  if (!obj?.client_email || !obj?.private_key) {
    throw new Error("GCP_SA_KEY_JSON parsed but missing client_email/private_key.");
  }
  return obj;
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

function safeSliceBySegments(text, segments) {
  if (!text || !Array.isArray(segments) || segments.length === 0) return "";
  let out = "";
  for (const seg of segments) {
    const start = Number(seg?.startIndex ?? 0);
    const end = Number(seg?.endIndex ?? 0);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      out += text.slice(start, end);
    }
  }
  return out;
}

/**
 * Extract per-page text using DocAI page.layout.textAnchor -> doc.text
 */
function getPerPageTextFromDoc(doc) {
  const text = doc.text || "";
  const pages = doc.pages || [];

  return pages.map((p) => {
    const segs = p?.layout?.textAnchor?.textSegments || [];
    const pageText = safeSliceBySegments(text, segs).trim();
    return pageText;
  });
}

/**
 * Always output PNG bytes for pages.
 * DocAI may return image/png or image/jpeg; we normalize to PNG.
 */
async function toPngBytes(mimeType, contentBytes) {
  const buf = Buffer.isBuffer(contentBytes) ? contentBytes : Buffer.from(contentBytes);
  // If already PNG, keep
  if ((mimeType || "").toLowerCase().includes("png")) return buf;
  // Convert to PNG
  return await sharp(buf).png().toBuffer();
}

/**
 * Simple, classical tag schema (replace later with Greimas SS).
 * We tag from PAGE TEXT for now (fast, stable, replaceable later with vision tagging).
 */
function buildTaggingPrompt({ docHint, items }) {
  // items: [{page, textExcerpt}]
  return `
You are an IP-BRAIN ingestion tagger.
Task: For each page, produce compact JSON tags to help later image selection for domains/cards.

Return STRICT JSON ONLY, no markdown.

Document hint (high level): ${docHint}

For each item, output:
{
  "page": number,
  "tags": string[],
  "entities": {
    "characters": string[],
    "locations": string[],
    "factions": string[],
    "objects": string[]
  },
  "domainAffinity": { "OVERVIEW": number, "CHARACTERS": number, "WORLD": number, "LORE": number, "STYLE": number, "STORY": number },
  "isPosterCandidate": boolean,
  "confidence": number
}

Rules:
- tags must be short tokens (1–3 words), max 18 tags.
- domainAffinity values 0..1 (floats).
- Use "Unknown" strings only if truly empty, otherwise [].
- Do NOT invent canon beyond the provided page excerpt.
- isPosterCandidate true only if it likely contains key art, cover-like page, main cast, or emblematic world/lore symbol.

Items:
${JSON.stringify(items, null, 2)}
`.trim();
}

async function tagPagesWithGemini({ pages }) {
  const apiKey = opt("GEMINI_API_KEY");
  if (!apiKey) {
    // No Gemini: return empty tags (but ingestion still works)
    return pages.map((p) => ({
      page: p.page,
      tags: [],
      entities: { characters: [], locations: [], factions: [], objects: [] },
      domainAffinity: { OVERVIEW: 0, CHARACTERS: 0, WORLD: 0, LORE: 0, STYLE: 0, STORY: 0 },
      isPosterCandidate: false,
      confidence: 0,
      note: "GEMINI_API_KEY missing",
    }));
  }

  const ai = new GoogleGenAI({ apiKey, vertexai: false });

  // Build a small document hint from early pages
  const hint = pages
    .slice(0, 3)
    .map((p) => p.textExcerpt)
    .join("\n---\n")
    .slice(0, 1500);

  const out = [];
  for (let i = 0; i < pages.length; i += TAG_BATCH_SIZE) {
    const batch = pages.slice(i, i + TAG_BATCH_SIZE);

    const prompt = buildTaggingPrompt({
      docHint: hint || "Unknown",
      items: batch.map((b) => ({
        page: b.page,
        textExcerpt: b.textExcerpt,
      })),
    });

    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { role: "user", parts: [{ text: prompt }] },
      config: { temperature: 0.1 },
    });

    const text = String(resp?.text || "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(
        `Gemini tagger returned non-JSON. First 400 chars: ${text.slice(0, 400)}`
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error("Gemini tagger must return a JSON array (one item per page).");
    }

    out.push(...parsed);
  }

  // Normalize required fields
  return out.map((x) => ({
    page: Number(x?.page || 0),
    tags: Array.isArray(x?.tags) ? x.tags.map(String) : [],
    entities: {
      characters: Array.isArray(x?.entities?.characters) ? x.entities.characters.map(String) : [],
      locations: Array.isArray(x?.entities?.locations) ? x.entities.locations.map(String) : [],
      factions: Array.isArray(x?.entities?.factions) ? x.entities.factions.map(String) : [],
      objects: Array.isArray(x?.entities?.objects) ? x.entities.objects.map(String) : [],
    },
    domainAffinity: {
      OVERVIEW: Number(x?.domainAffinity?.OVERVIEW ?? 0),
      CHARACTERS: Number(x?.domainAffinity?.CHARACTERS ?? 0),
      WORLD: Number(x?.domainAffinity?.WORLD ?? 0),
      LORE: Number(x?.domainAffinity?.LORE ?? 0),
      STYLE: Number(x?.domainAffinity?.STYLE ?? 0),
      STORY: Number(x?.domainAffinity?.STORY ?? 0),
    },
    isPosterCandidate: Boolean(x?.isPosterCandidate),
    confidence: Math.max(0, Math.min(1, Number(x?.confidence ?? 0))),
  }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const projectId = need("GCP_PROJECT_ID");
    const location = need("DOCAI_LOCATION");
    const processorId = need("DOCAI_PROCESSOR_ID");

    const body = readJsonBody(req);
    const blobUrl = body?.blobUrl;
    const projectKey = String(body?.projectId || "default");

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    const client = makeDocAIClient();

    // Fetch PDF bytes (already uploaded to Blob)
    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }
    const pdfBuf = Buffer.from(await r.arrayBuffer());

    // Count pages
    const src = await PDFDocument.load(pdfBuf);
    const totalPages = src.getPageCount();

    // Ingestion id and blob prefix
    const ingestionId = `ingest-${Date.now()}`;
    const prefix = `otherly/${projectKey}/${ingestionId}`;

    // Accumulators
    const fullTextParts = [];
    const pageImages = []; // {page, imageUrl, width, height}
    const perPageText = []; // {page, text}
    let imagesMissingCount = 0;

    // Single DocAI loop: text + page images + per-page text
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

      const chunkText = doc.text || "";
      if (chunkText) fullTextParts.push(chunkText);

      const pageTexts = getPerPageTextFromDoc(doc); // array aligned to pages in this chunk
      const pages = doc.pages || [];

      for (let i = 0; i < pages.length; i++) {
        const globalPage = start + 1 + i;

        // ---- per-page text segment (segmentation + metatags base)
        const t = (pageTexts[i] || "").trim();
        perPageText.push({
          page: globalPage,
          text: t,
          meta: {
            charCount: t.length,
            wordCount: t ? t.split(/\s+/).filter(Boolean).length : 0,
          },
        });

        // ---- page image (raster) -> ALWAYS PNG -> Blob
        const img = pages[i]?.image;
        const content = img?.content;
        const mimeType = img?.mimeType || "image/png";

        if (!content) {
          imagesMissingCount += 1;
          continue;
        }

        const pngBytes = await toPngBytes(mimeType, content);

        const key = `${prefix}/pages/page-${String(globalPage).padStart(3, "0")}.png`;
        const blob = await put(key, pngBytes, {
          access: "public",
          contentType: "image/png",
        });

        pageImages.push({
          page: globalPage,
          imageUrl: blob.url,
          width: Number(img?.width || 0),
          height: Number(img?.height || 0),
        });
      }
    }

    const fullText = fullTextParts.join("\n\n");

    // Store fullText.txt
    const textBlob = await put(`${prefix}/fullText.txt`, fullText, {
      access: "public",
      contentType: "text/plain; charset=utf-8",
    });

    // Build tagging inputs (excerpt per page)
    const tagInputs = perPageText.map((p) => ({
      page: p.page,
      textExcerpt: (p.text || "").slice(0, 1400), // keep small/fast
    }));

    // Tag pages (stored as tags.json)
    const tags = await tagPagesWithGemini({ pages: tagInputs });

    const tagsBlob = await put(`${prefix}/tags.json`, JSON.stringify({ tags }, null, 2), {
      access: "public",
      contentType: "application/json; charset=utf-8",
    });

    // Manifest (single source of truth)
    const manifest = {
      ok: true,
      ingestionId,
      createdAt: new Date().toISOString(),
      pdfBlobUrl: blobUrl,
      pageCount: totalPages,

      // Stored assets
      textUrl: textBlob.url,
      tagsUrl: tagsBlob.url,

      // In-memory mirrors (so client can show immediately)
      fullText,
      pageImages,
      perPageText,

      // counts
      pageImagesCount: pageImages.length,
      imagesMissingCount,
    };

    const manifestBlob = await put(`${prefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
      access: "public",
      contentType: "application/json; charset=utf-8",
    });

    // IMPORTANT: respond in the shape your client helper already expects
    return res.status(200).json({
      ok: true,
      pdfBlobUrl: blobUrl,
      ingestionId,
      pageCount: totalPages,
      fullText,
      pageImages,
      textUrl: textBlob.url,
      tagsUrl: tagsBlob.url,
      manifestUrl: manifestBlob.url,
      imagesMissingCount,
    });
  } catch (e) {
    console.error("pdf-ingest error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

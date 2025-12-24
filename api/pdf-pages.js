// api/pdf-pages.js
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export const config = { maxDuration: 300 };

// Resolve worker URL in a way that works in Node/Vercel
const WORKER_CANDIDATES = [
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  "pdfjs-dist/build/pdf.worker.mjs",
  "pdfjs-dist/build/pdf.worker.min.mjs",
];

let resolvedWorkerSrc = null;
for (const spec of WORKER_CANDIDATES) {
  try {
    // Node 20+: import.meta.resolve returns a URL string (e.g. file:///var/task/...)
    resolvedWorkerSrc = import.meta.resolve(spec);
    break;
  } catch {}
}

if (resolvedWorkerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = resolvedWorkerSrc;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    if (!resolvedWorkerSrc) {
      return res.status(500).json({
        error:
          'pdfjs worker not found. Tried: ' + WORKER_CANDIDATES.join(", "),
      });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

    const blobUrl = body?.blobUrl;
    const maxPagesText =
      typeof body?.maxPagesText === "number" ? body.maxPagesText : null;

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }

    const bytes = new Uint8Array(await r.arrayBuffer());

    const loadingTask = pdfjsLib.getDocument({
      data: bytes,
      // You can keep workers enabled now that workerSrc is set
      disableWorker: false,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;

    const lastPage =
      maxPagesText && Number.isFinite(maxPagesText)
        ? Math.min(pageCount, Math.max(1, Math.floor(maxPagesText)))
        : pageCount;

    const parts = [];

    for (let i = 1; i <= lastPage; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const pageText = (tc.items || [])
        .map((it) => (it && it.str ? String(it.str) : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText) parts.push(pageText);
    }

    return res.status(200).json({
      ok: true,
      pageCount,
      fullText: parts.join("\n\n"),
      pageImages: [],
      pagesWithImages: 0,
      workerSrc: resolvedWorkerSrc,
    });
  } catch (e) {
    console.error("pdf-pages error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

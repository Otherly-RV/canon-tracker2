// api/pdf-pages.js
import { createRequire } from "module";

export const config = { maxDuration: 300 };

// Load pdfjs in a Vercel-friendly way (CJS build)
const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// ✅ This is the key fix: give pdfjs a real worker path it can resolve.
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
  "pdfjs-dist/legacy/build/pdf.worker.js"
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
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
      // You can keep worker enabled now that workerSrc is valid.
      // If you prefer: disableWorker: true is also OK, workerSrc is still required.
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
    });
  } catch (e) {
    console.error("pdf-pages error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

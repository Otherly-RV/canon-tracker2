import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

    const blobUrl = body?.blobUrl;

    // Optional: limit pages to extract text from (useful for huge PDFs)
    const maxPagesText =
      typeof body?.maxPagesText === "number" ? body.maxPagesText : null;

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    // 1) Fetch PDF bytes
    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res
        .status(400)
        .json({ error: `Could not fetch blobUrl (${r.status})` });
    }
    const bytes = new Uint8Array(await r.arrayBuffer());

    // 2) Load PDF (server-safe)
    const loadingTask = pdfjsLib.getDocument({
      data: bytes,
      disableWorker: true,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;

    // 3) Extract full text (no images here)
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

    const fullText = parts.join("\n\n");

    return res.status(200).json({
      ok: true,
      pageCount,
      fullText,
      pageImages: [],
      pagesWithImages: 0,
    });
  } catch (e) {
    console.error("pdf-pages error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

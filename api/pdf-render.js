// api/pdf-render.js
import { put } from "@vercel/blob";
import sharpPkg from "sharp";

export const config = { maxDuration: 300 };

// sharp is CommonJS; this makes it work in ESM deployments too
const sharp = sharpPkg.default ?? sharpPkg;

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

    const blobUrl = body?.blobUrl;
    const prefix = body?.prefix || `pdf-pages/${Date.now()}`;
    const density = typeof body?.density === "number" ? body.density : 150;

    let startPage = body?.startPage ?? 1;
    let endPage = body?.endPage ?? 1;

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    // 1) Download PDF
    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }
    const pdfBuffer = Buffer.from(await r.arrayBuffer());

    // 2) Determine page count via sharp metadata (no pdfjs)
    // Some PDFs might not expose pages cleanly; if metadata.pages is missing, we still render requested range.
    let totalPages = null;
    try {
      const m = await sharp(pdfBuffer, { density }).metadata();
      if (typeof m.pages === "number" && m.pages > 0) totalPages = m.pages;
    } catch {
      // ignore: we'll still attempt render
    }

    if (totalPages) {
      startPage = clampInt(startPage, 1, totalPages);
      endPage = clampInt(endPage, startPage, totalPages);
    } else {
      // fallback clamp (still safe)
      startPage = clampInt(startPage, 1, 9999);
      endPage = clampInt(endPage, startPage, 9999);
    }

    const pageImages = [];

    // 3) Render each page to PNG and upload
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      // sharp uses 0-based page index
      const pageIndex = pageNum - 1;

      const img = sharp(pdfBuffer, { density, page: pageIndex }).png();
      const meta = await img.metadata();
      const pngBuffer = await img.toBuffer();

      const key = `${prefix}/page-${String(pageNum).padStart(3, "0")}.png`;

      const blob = await put(key, pngBuffer, {
        access: "public",
        contentType: "image/png",
      });

      pageImages.push({
        page: pageNum,
        imageUrl: blob.url,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      });
    }

    return res.status(200).json({
      ok: true,
      pageCount: totalPages, // may be null; client can use pdf-pages for count
      startPage,
      endPage,
      pagesRendered: pageImages.length,
      pageImages,
    });
  } catch (e) {
    console.error("pdf-render error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

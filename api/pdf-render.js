import { createCanvas } from "@napi-rs/canvas";
import { put } from "@vercel/blob";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export const config = { maxDuration: 300 };

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

    const blobUrl = body?.blobUrl;
    const prefix = body?.prefix || `pdf-render/${Date.now()}`;
    const scale = Number(body?.scale ?? 1.25);

    let startPage = body?.startPage ?? 1;
    let endPage = body?.endPage ?? 1;

    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    // 1) Download PDF bytes
    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
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

    startPage = clampInt(startPage, 1, pageCount);
    endPage = clampInt(endPage, startPage, pageCount);

    const pageImages = [];

    // 3) Render to PNG + upload to Blob
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      );
      const ctx = canvas.getContext("2d");

      await page.render({ canvasContext: ctx, viewport }).promise;

      const png = canvas.toBuffer("image/png");
      const key = `${prefix}/page-${String(pageNum).padStart(3, "0")}.png`;

      const blob = await put(key, png, {
        access: "public",
        contentType: "image/png",
      });

      pageImages.push({
        page: pageNum,
        imageUrl: blob.url,
        width: canvas.width,
        height: canvas.height,
      });
    }

    return res.status(200).json({
      ok: true,
      pageCount,
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

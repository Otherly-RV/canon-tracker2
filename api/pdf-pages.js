// api/pdf-pages.js
import { put } from "@vercel/blob";
import { createCanvas } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// ✅ Force Vercel to include the worker file in the serverless bundle
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

export const config = { maxDuration: 300 };

// ✅ Point pdf.js fake worker at a REAL file URL inside the serverless bundle
const require = createRequire(import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
).toString();

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

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    const body = readJsonBody(req);
    const blobUrl = body?.blobUrl;
    const prefix = body?.prefix || `pdf-pages/${Date.now()}`;
    const scale = typeof body?.scale === "number" ? body.scale : 1.5; // 1.0–2.0 typical

    if (!blobUrl || typeof blobUrl !== "string") {
      res.status(400).json({ error: "Missing blobUrl" });
      return;
    }

    // 1) Fetch PDF bytes (from Vercel Blob URL)
    const r = await fetch(blobUrl);
    if (!r.ok) {
      res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
      return;
    }

    const pdfBytes = new Uint8Array(await r.arrayBuffer());

    // 2) Load PDF via pdf.js (Node) and render each page to PNG
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      // ✅ Avoid worker_threads in serverless, use "fake worker" (needs workerSrc set)
      disableWorker: true,
    });

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;

    const pageImages = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
      });

      await renderTask.promise;

      const pngBuf = canvas.toBuffer("image/png");

      const key = `${prefix}/page-${String(pageNum).padStart(3, "0")}.png`;
      const blob = await put(key, pngBuf, {
        access: "public",
        contentType: "image/png",
      });

      pageImages.push({
        page: pageNum,
        imageUrl: blob.url,
        width: Math.ceil(viewport.width),
        height: Math.ceil(viewport.height),
      });
    }

    await loadingTask.destroy();

    res.status(200).json({
      ok: true,
      pageCount,
      pageImages,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

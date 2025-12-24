// api/pdf-pages.js
import { PDFDocument } from "pdf-lib";

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

    const blobUrl = body?.blobUrl;
    if (!blobUrl || typeof blobUrl !== "string") {
      return res.status(400).json({ error: "Missing blobUrl" });
    }

    const r = await fetch(blobUrl);
    if (!r.ok) {
      return res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    }

    const bytes = new Uint8Array(await r.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);

    return res.status(200).json({
      ok: true,
      pageCount: pdf.getPageCount(),
    });
  } catch (e) {
    console.error("pdf-pages error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

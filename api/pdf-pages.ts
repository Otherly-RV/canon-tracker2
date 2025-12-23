import { PDFDocument } from "pdf-lib";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body ?? {});

  const blobUrl = body?.blobUrl;

  if (!blobUrl || typeof blobUrl !== "string") {
    res.status(400).json({ error: "Missing blobUrl" });
    return;
  }

  const r = await fetch(blobUrl);
  if (!r.ok) {
    res.status(400).json({ error: `Could not fetch blobUrl (${r.status})` });
    return;
  }

  const bytes = new Uint8Array(await r.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  const pageCount = pdf.getPageCount();

  res.status(200).json({ ok: true, pageCount });
}

import { upload } from "@vercel/blob/client";

export type PdfPageImage = { page: number; url: string; width: number; height: number };

export async function uploadPdfAndExtractPages(file: File, projectId = "default") {
  // 1) upload PDF to Blob
  const up = await upload(`uploads/${projectId}/${Date.now()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
  });

  // 2) get full text + pageCount (DocAI text / pdf-lib count)
  const metaRes = await fetch("/api/pdf-pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: up.url,
      prefix: `projects/${projectId}/pdf-meta/${Date.now()}-${file.name}`,
    }),
  });

  const meta = await metaRes.json();
  if (!metaRes.ok) throw new Error(meta?.error || "pdf-pages failed");

  const pageCount = Number(meta.pageCount || 0);
  const fullText = String(meta.fullText || "");

  // 3) render ALL pages to PNG (batch so we never hit 300s)
  const BATCH = 6; // adjust later (6 pages per call is usually safe)
  const pageImages: PdfPageImage[] = [];

  for (let start = 1; start <= pageCount; start += BATCH) {
    const end = Math.min(pageCount, start + BATCH - 1);

    const rr = await fetch("/api/pdf-render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blobUrl: up.url,
        prefix: `projects/${projectId}/pdf-pages/${Date.now()}-${file.name}`,
        startPage: start,
        endPage: end,
        scale: 1.25,
      }),
    });

    const jj = await rr.json();
    if (!rr.ok) throw new Error(jj?.error || "pdf-render failed");

    for (const p of jj.pageImages || []) {
      pageImages.push({
        page: Number(p.page),
        url: String(p.imageUrl),
        width: Number(p.width || 0),
        height: Number(p.height || 0),
      });
    }
  }

  // sort just in case
  pageImages.sort((a, b) => a.page - b.page);

  return {
    pdfBlobUrl: up.url as string,
    fullText,
    pageImages,
  };
}

import { upload } from "@vercel/blob/client";

export type PdfPageImage = { page: number; imageUrl: string; width: number; height: number };

export async function uploadPdfAndExtractPages(file: File, projectId = "default") {
  // 1) Upload the original PDF to Blob (same as your test)
  const up = await upload(`uploads/${projectId}/${Date.now()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
  });

  // 2) Ask your server to run DocAI and return page images + extracted text
  const r = await fetch("/api/pdf-pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: up.url,
      prefix: `projects/${projectId}/pdf-pages/${Date.now()}-${file.name}`,
    }),
  });

  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || "pdf-pages failed");

  return {
    pdfBlobUrl: up.url as string,
    fullText: j.fullText as string,
    pageImages: (j.pageImages || []) as PdfPageImage[],
  };
}

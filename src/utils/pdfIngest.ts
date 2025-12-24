import { upload } from "@vercel/blob/client";

export type PdfPageImage = {
  page: number; // 1-based
  imageUrl: string | null;
  width: number;
  height: number;
  pageTextUrl: string;
};

export type PdfIngestResponse = {
  ok: true;
  projectId: string;
  ingestionId: string;
  prefix: string;
  pdfBlobUrl: string;
  pageCount: number;
  manifestUrl: string;
  fullTextUrl: string;
  tagsUrl: string;
  pageImagesCount: number;
  pages: PdfPageImage[];
};

export async function uploadPdfToBlob(file: File) {
  // Upload ONLY the PDF (public). Images are produced server-side from DocAI.
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
  });

  return blob.url;
}

export async function pdfIngestFromBlob(args: {
  blobUrl: string;
  projectId?: string;
  ingestionId?: string; // optional override
}): Promise<PdfIngestResponse> {
  const r = await fetch("/api/pdf-ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `pdf-ingest failed (${r.status})`);
  if (!j?.ok) throw new Error(j?.error || "pdf-ingest failed (no ok)");

  return j as PdfIngestResponse;
}

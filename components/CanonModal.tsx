import React, { useRef, useState } from "react";
import { useCompleteness } from "../context/CompletenessContext";
import { pdfIngestFromBlob, uploadPdfToBlob } from "../src/utils/pdfIngest";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function CanonModal({ isOpen, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    setPdfBlobUrl,
    setPdfPageImages,
    setPdfManifestUrl,
    setCanonText,
    setExtractedContent,
    setIsViewerVisible,
  } = useCompleteness();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setBusy(true);
    setStatus("Uploading PDF to Blob…");

    try {
      // 1) upload PDF (only)
      const pdfBlobUrl = await uploadPdfToBlob(f);

      setStatus("Ingesting with DocAI (text + PNG pages + tags)…");

      // 2) ingest on server (DocAI + PNG conversion + tags + manifest)
      const ingest = await pdfIngestFromBlob({
        blobUrl: pdfBlobUrl,
        projectId: "default",
      });

      setPdfBlobUrl(ingest.pdfBlobUrl);
      setPdfManifestUrl(ingest.manifestUrl);

      // IMPORTANT: keep images in memory for now (Process step will select later)
      // Map to your app’s PdfPageImage type (it expects {page,url,width,height})
      setPdfPageImages(
        ingest.pages
          .filter((p) => !!p.imageUrl)
          .map((p) => ({
            page: p.page,
            url: p.imageUrl as string,
            width: p.width,
            height: p.height,
          }))
      );

      // 3) fetch full text (so UI shows text immediately)
      const textResp = await fetch(ingest.fullTextUrl);
      const fullText = textResp.ok ? await textResp.text() : "";

      setCanonText(fullText);
      setExtractedContent({ content: fullText, format: "text" });
      setIsViewerVisible(true);

      setStatus(`✅ Ingest done: ${ingest.pageCount} pages, ${ingest.pageImagesCount} PNG images`);
    } catch (err: any) {
      setStatus(`❌ ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: 720,
          maxWidth: "92vw",
          background: "#0b1220",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Ingest PDF</div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 10,
              padding: "6px 10px",
              color: "white",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ marginTop: 14, opacity: 0.9, lineHeight: 1.35 }}>
          This step does ONLY ingest:
          <br />
          1) Upload PDF to Blob
          <br />
          2) DocAI extract full text + page images → stored as <b>PNG only</b>
          <br />
          3) Create tags + manifest in Blob
        </div>

        <div style={{ marginTop: 14 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={onPickFile}
            style={{ width: "100%" }}
          />
        </div>

        {status && (
          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.9 }}>
            {busy ? "⏳ " : ""}
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

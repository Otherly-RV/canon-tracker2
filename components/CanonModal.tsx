import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Save, X } from "lucide-react";
import { useCompleteness } from "../context/CompletenessContext.tsx";
import { extractTextFromFile } from "../utils/fileReader.ts";
import { uploadPdfAndExtractPages } from "../utils/uploadPdfAndExtractPages.ts";

const Editor: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full h-[55vh] bg-slate-900/60 border border-slate-700 rounded-lg p-4 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:outline-none resize-none font-mono text-sm"
  />
);

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const CanonModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    canonText,
    setCanonText,
    setExtractedContent,
    setIsViewerVisible,

    // ✅ new: PDF assets
    setPdfBlobUrl,
    setPdfPageImages,
  } = useCompleteness();

  const [localCanon, setLocalCanon] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLocalCanon(canonText || "");
    setStatus(null);
    setErr(null);
  }, [isOpen, canonText]);

  const onUploadClick = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErr(null);
    setStatus("Uploading + extracting (server)…");

    try {
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        // ✅ Server pipeline:
        // 1) upload to Blob
        // 2) DocAI extracts fullText + page images
        const { pdfBlobUrl, fullText, pageImages } = await uploadPdfAndExtractPages(
          file,
          "default"
        );

        setPdfBlobUrl(pdfBlobUrl);
        setPdfPageImages(pageImages);

        setCanonText(fullText);
        setExtractedContent({ content: fullText, format: "text" });

        setLocalCanon(fullText);
        setIsViewerVisible(true);

        setStatus(
          `Extracted via DocAI ✅ (text + ${pageImages.length} page images). Review and Save.`
        );
      } else {
        // DOCX fallback (client-side)
        setStatus("Extracting (client)…");
        const extracted = await extractTextFromFile(file);

        setCanonText(extracted.content);
        setExtractedContent(extracted);

        setLocalCanon(extracted.content);
        setIsViewerVisible(true);

        setStatus("Extracted. Review and Save.");
      }
    } catch (ex: any) {
      setStatus(null);
      setErr(ex?.message || "Failed to extract document.");
    } finally {
      e.target.value = "";
    }
  };

  const onSave = () => {
    setCanonText(localCanon);
    setStatus("Saved.");
    setTimeout(() => setStatus(null), 1200);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <div className="text-slate-100 font-semibold">Canon</div>
                <div className="text-xs text-slate-400">
                  Upload PDF/DOCX. PDF uses server extraction (text + page images). Saving
                  persists across sessions.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={onFileChange}
                  className="hidden"
                />
                <button
                  onClick={onUploadClick}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  <Upload size={16} />
                  Upload
                </button>
                <button
                  onClick={onSave}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                >
                  <Save size={16} />
                  Save
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="px-6 py-4">
              {err && (
                <div className="mb-3 text-sm text-red-300 bg-red-950/40 border border-red-900/50 rounded-md p-3">
                  {err}
                </div>
              )}
              {status && (
                <div className="mb-3 text-sm text-sky-200 bg-sky-950/30 border border-sky-900/40 rounded-md p-3">
                  {status}
                </div>
              )}

              <Editor
                value={localCanon}
                onChange={setLocalCanon}
                placeholder="Paste your canon text here, or upload a PDF/DOCX."
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CanonModal;

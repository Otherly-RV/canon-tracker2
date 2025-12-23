import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Save, AlertTriangle, Copy, Download } from "lucide-react";
import { upload } from "@vercel/blob/client";

import { useCompleteness } from "../context/CompletenessContext.tsx";
import { extractTextFromFile } from "../utils/fileReader.ts";

type Tab = "canon" | "contract" | "rules";

type PdfPagesResponse = {
  ok: boolean;
  fullText: string;
  pageImages: Array<{ page: number; imageUrl: string; width: number; height: number }>;
};

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    canonText,
    setCanonText,
    execContractText,
    setExecContractText,
    fieldRules,
    setFieldRules,
    setExtractedContent,

    // NEW (6B)
    pdfPageImages,
    setPdfPageImages,
    setPdfBlobUrl,
  } = useCompleteness();

  const [activeTab, setActiveTab] = useState<Tab>("canon");

  const [localCanon, setLocalCanon] = useState("");
  const [localContract, setLocalContract] = useState("");
  const [localRules, setLocalRules] = useState("");

  const [rulesError, setRulesError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalCanon(canonText);
      setLocalContract(execContractText);
      setLocalRules(JSON.stringify(fieldRules, null, 2));
      setRulesError(null);
      setCopySuccess("");
      setUploadError(null);
    }
  }, [isOpen, canonText, execContractText, fieldRules]);

  const handleSave = (tab: Tab) => {
    if (tab === "canon") {
      setCanonText(localCanon);
    } else if (tab === "contract") {
      setExecContractText(localContract);
    } else if (tab === "rules") {
      try {
        const parsedRules = JSON.parse(localRules);
        setFieldRules(parsedRules);
        setRulesError(null);
      } catch (e) {
        setRulesError(e instanceof Error ? e.message : "Invalid JSON format.");
        return;
      }
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess("Copied!");
      setTimeout(() => setCopySuccess(""), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([localRules], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "field-rules.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  async function uploadPdfToBlob(file: File) {
    // IMPORTANT: same client upload pattern as your test
    return upload(`uploads/${Date.now()}-${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/blob-upload",
      multipart: true,
    });
  }

  async function extractPdfPagesFromServer(pdfBlobUrl: string) {
    const r = await fetch("/api/pdf-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blobUrl: pdfBlobUrl,
        prefix: `pdf-pages/${Date.now()}-${fileInputRef.current?.files?.[0]?.name || "upload"}`,
      }),
    });

    const j = (await r.json()) as any;
    if (!r.ok) throw new Error(j?.error || "pdf-pages failed");
    return j as PdfPagesResponse;
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadBusy(true);
    setUploadError(null);

    try {
      if (file.type === "application/pdf") {
        // 1) upload PDF to Blob
        const up = await uploadPdfToBlob(file);
        setPdfBlobUrl(up.url);

        // 2) call server to run DocAI and return page images + full text
        const result = await extractPdfPagesFromServer(up.url);

        // 3) update canon text
        const fullText = String(result.fullText || "");
        setExtractedContent({ content: fullText, format: "text" });
        setLocalCanon(fullText);
        setCanonText(fullText);

        // 4) store pdf page images (Blob URLs returned by server)
        const pages = Array.isArray(result.pageImages) ? result.pageImages : [];
        setPdfPageImages(
          pages.map((p) => ({
            page: Number(p.page),
            url: String(p.imageUrl),
            width: Number(p.width || 0),
            height: Number(p.height || 0),
          }))
        );
      } else {
        // DOCX fallback = text only
        const extracted = await extractTextFromFile(file);
        setExtractedContent(extracted);

        const plainText =
          extracted.format === "html"
            ? new DOMParser().parseFromString(extracted.content, "text/html").body.textContent || ""
            : extracted.content;

        setLocalCanon(plainText);
        setCanonText(plainText);

        // clear pdf images for non-pdf
        setPdfBlobUrl(null);
        setPdfPageImages([]);
      }
    } catch (e: any) {
      console.error("Error reading file:", e);
      setUploadError(e?.message || "Upload failed");
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const TabButton: React.FC<{ tab: Tab; label: string }> = ({ tab, label }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
        activeTab === tab ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700/50"
      }`}
    >
      {label}
    </button>
  );

  const Editor: React.FC<{ value: string; onChange: (val: string) => void; placeholder?: string }> = ({
    value,
    onChange,
    placeholder,
  }) => (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full flex-1 bg-slate-900 text-slate-300 p-4 rounded-md border border-slate-700 focus:ring-2 focus:ring-sky-500 focus:outline-none resize-none font-mono text-sm"
    />
  );

  const TabHeader: React.FC<{ onSave: () => void; onCopy: () => void; onDownload?: () => void }> = ({
    onSave,
    onCopy,
    onDownload,
  }) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-500 transition-colors"
        >
          <Save size={14} /> Save
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-400 transition-opacity duration-300 opacity-100">{copySuccess}</span>
        <button
          onClick={onCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-600 text-white rounded-md hover:bg-slate-500 transition-colors"
        >
          <Copy size={14} /> Copy
        </button>
        {onDownload && (
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-sky-600 text-white rounded-md hover:bg-sky-500 transition-colors"
          >
            <Download size={14} /> Download JSON
          </button>
        )}
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
              <button
                onClick={onClose}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
              >
                <X size={20} />
              </button>
            </header>

            <div className="flex-shrink-0 px-4 pt-2 border-b border-slate-700">
              <TabButton tab="canon" label="Canon" />
              <TabButton tab="contract" label="Exec Contract" />
              <TabButton tab="rules" label="Field Rules" />
            </div>

            <main className="flex-1 overflow-y-auto p-6">
              {activeTab === "canon" && (
                <div className="h-full flex flex-col">
                  <TabHeader onSave={() => handleSave("canon")} onCopy={() => handleCopy(localCanon)} />

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadBusy}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-600 text-white rounded-md hover:bg-slate-500 transition-colors mb-2 w-fit disabled:opacity-60"
                  >
                    <Upload size={16} />
                    {uploadBusy ? "Uploading…" : "Upload Document"}
                  </button>

                  {uploadError && (
                    <div className="mb-3 text-sm text-red-300 bg-red-900/30 border border-red-800/40 rounded-md p-3">
                      {uploadError}
                    </div>
                  )}

                  {/* NEW: show extracted PDF page images */}
                  {pdfPageImages.length > 0 && (
                    <div className="mb-3">
                      <div className="text-sm text-slate-300 mb-2">
                        Extracted PDF page images: {pdfPageImages.length}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {pdfPageImages.map((p) => (
                          <div
                            key={p.page}
                            className="rounded-md overflow-hidden border border-slate-700 bg-slate-900/40"
                          >
                            <img src={p.url} className="w-full h-28 object-cover block" />
                            <div className="px-2 py-1 text-xs text-slate-300">Page {p.page}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Editor
                    value={localCanon}
                    onChange={setLocalCanon}
                    placeholder="Paste your canon text here, or upload a document."
                  />
                </div>
              )}

              {activeTab === "contract" && (
                <div className="h-full flex flex-col">
                  <TabHeader onSave={() => handleSave("contract")} onCopy={() => handleCopy(localContract)} />
                  <Editor value={localContract} onChange={setLocalContract} />
                </div>
              )}

              {activeTab === "rules" && (
                <div className="h-full flex flex-col">
                  <TabHeader onSave={() => handleSave("rules")} onCopy={() => handleCopy(localRules)} onDownload={handleDownload} />
                  <Editor value={localRules} onChange={setLocalRules} />
                  {rulesError && (
                    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/30 p-3 rounded-md mt-4">
                      <AlertTriangle size={16} />
                      <span>{rulesError}</span>
                    </div>
                  )}
                </div>
              )}
            </main>

            <footer className="flex justify-end p-4 border-t border-slate-700">
              <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-600 text-white rounded-md hover:bg-slate-500">
                Close
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;

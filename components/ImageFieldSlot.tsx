import React, { useMemo } from "react";
import { useCompleteness } from "../context/CompletenessContext";
import { isImagePath } from "../data/schema-runtime";

type Props = {
  path: string;
  label: string;
};

export default function ImageFieldSlot({ path, label }: Props) {
  const { fieldContents, updateFieldContent, pdfPageImages } = useCompleteness();

  const value = useMemo(() => {
    const v = fieldContents.get(path);
    if (v === undefined || v === null) return "";
    return String(v);
  }, [fieldContents, path]);

  const isEmpty = !value || value.trim() === "" || value === "Unknown";

  const canAutofill =
    isImagePath(path) &&
    isEmpty &&
    Array.isArray(pdfPageImages) &&
    pdfPageImages.length > 0 &&
    typeof pdfPageImages[0]?.imageUrl === "string" &&
    pdfPageImages[0].imageUrl.length > 0;

  function autofillFromPdf() {
    if (!pdfPageImages?.length) return;
    const first = pdfPageImages[0];
    if (!first?.imageUrl) return;
    updateFieldContent(path, first.imageUrl);
  }

  function clearField() {
    updateFieldContent(path, "");
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-200">{label}</div>
          <div className="mt-1 text-xs text-slate-400">{path}</div>
        </div>

        <div className="flex gap-2">
          {canAutofill ? (
            <button
              className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 text-xs hover:bg-white/5"
              onClick={autofillFromPdf}
              title="Auto-fill from extracted PDF page images"
            >
              Auto-fill
            </button>
          ) : null}

          {!isEmpty ? (
            <button
              className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 text-xs hover:bg-white/5"
              onClick={clearField}
              title="Clear this field"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        {isEmpty ? (
          <div className="text-sm text-slate-400">
            No image yet.{" "}
            {pdfPageImages?.length ? "Click Auto-fill." : "Upload a PDF first."}
          </div>
        ) : (
          <img
            src={value}
            alt={label}
            className="w-full max-h-[360px] object-contain rounded-md border border-slate-700 bg-black/20"
          />
        )}

        <div className="mt-2 text-xs text-slate-500 break-all">
          {value ? value : "—"}
        </div>
      </div>
    </div>
  );
}

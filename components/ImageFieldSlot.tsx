import React, { useMemo } from "react";
import { useCompleteness } from "../context/CompletenessContext";
import { isImagePath } from "../data/schema-runtime";

type Props = {
  path: string;
  label: string;
};

export default function ImageFieldSlot({ path, label }: Props) {
  const {
    fieldContents,
    updateFieldContent,
    fieldMeta,
    updateFieldMeta,
    pdfPageImages,
  } = useCompleteness();

  // Current value stored in the field (should be a URL or "Unknown")
  const value = useMemo(() => {
    const v = fieldContents.get(path);
    if (v === undefined || v === null) return "";
    return String(v);
  }, [fieldContents, path]);

  const meta = fieldMeta.get(path);
  const isGenerated = meta?.source === "generated" || meta?.source === "prompt";
  const showPin = isGenerated; // red pin = generated/prompt-only image

  // “Best effort” auto-fill: use page 1 image if empty
  const canAutofill =
    isImagePath(path) &&
    (!value || value.trim() === "" || value === "Unknown") &&
    Array.isArray(pdfPageImages) &&
    pdfPageImages.length > 0;

  function autofillFromPdf() {
    if (!pdfPageImages?.length) return;

    // Simple baseline: page 1
    const first = pdfPageImages[0];
    if (!first?.imageUrl) return;

    updateFieldContent(path, first.imageUrl);
    updateFieldMeta(path, {
      kind: "image",
      source: "extracted",
      pinned: false,
      note: "Auto-filled from PDF page 1 (baseline).",
    });
  }

  function clearField() {
    updateFieldContent(path, "");
    updateFieldMeta(path, {
      kind: "image",
      source: "unknown",
      pinned: false,
      note: "",
    });
  }

  const isEmpty = !value || value.trim() === "" || value === "Unknown";

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            {label}
            {showPin ? (
              <span className="inline-flex items-center gap-1 text-xs text-red-300">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                generated (doesn’t count)
              </span>
            ) : null}
          </div>
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
            No image yet. {pdfPageImages?.length ? "Click Auto-fill." : "Upload a PDF first."}
          </div>
        ) : (
          <div className="relative">
            <img
              src={value}
              alt={label}
              className="w-full max-h-[360px] object-contain rounded-md border border-slate-700 bg-black/20"
            />
          </div>
        )}

        {/* Show raw URL (debug) */}
        <div className="mt-2 text-xs text-slate-500 break-all">
          {value ? value : "—"}
        </div>
      </div>
    </div>
  );
}

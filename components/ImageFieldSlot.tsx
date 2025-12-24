import React, { useEffect, useMemo } from "react";
import { useCompleteness } from "../context/CompletenessContext";

type Props = {
  path: string;
  label: string;
};

function isProbablyImageUrl(v: string): boolean {
  if (!v) return false;

  // Accept common URL schemes and Vercel Blob URLs
  if (v.startsWith("http://") || v.startsWith("https://")) return true;
  if (v.startsWith("data:image/")) return true;
  if (v.startsWith("blob:")) return true;

  return false;
}

function truncate(s: string, max = 220): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

export default function ImageFieldSlot({ path, label }: Props) {
  const { fieldContents, updateFieldContent, pdfPageImages } = useCompleteness();

  const rawValue = useMemo(() => {
    const v = fieldContents.get(path);
    if (v === undefined || v === null) return "";
    return String(v);
  }, [fieldContents, path]);

  const imageUrl = useMemo(() => {
    return isProbablyImageUrl(rawValue) ? rawValue : "";
  }, [rawValue]);

  // If the value isn't a URL, treat it as prompt-ish text (and don't break <img>)
  const promptText = useMemo(() => {
    return !isProbablyImageUrl(rawValue) && rawValue.trim() ? rawValue : "";
  }, [rawValue]);

  const isEmptyImage = !imageUrl || imageUrl === "Unknown";

  const canAutofill =
    Array.isArray(pdfPageImages) &&
    pdfPageImages.length > 0 &&
    typeof pdfPageImages[0]?.imageUrl === "string" &&
    pdfPageImages[0].imageUrl.length > 0;

  const isKeyArtPoster = path.endsWith(".KeyArtPoster");

  function autofillFromPdfPage1() {
    if (!canAutofill) return;
    updateFieldContent(path, pdfPageImages[0].imageUrl);
  }

  function clearField() {
    updateFieldContent(path, "");
  }

  // ✅ Auto-fill KeyArtPoster (no user picking) if empty/invalid
  useEffect(() => {
    if (!isKeyArtPoster) return;
    if (!canAutofill) return;

    // If the field currently contains non-url text or empty, replace with page 1 image
    if (isEmptyImage) {
      autofillFromPdfPage1();
    }
  }, [isKeyArtPoster, canAutofill, isEmptyImage]); // intentionally minimal deps

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-200">{label}</div>
          <div className="mt-1 text-xs text-slate-400">{path}</div>
        </div>

        <div className="flex gap-2">
          {!isEmptyImage ? (
            <button
              className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 text-xs hover:bg-white/5"
              onClick={clearField}
              title="Clear this image"
            >
              Clear
            </button>
          ) : null}

          {/* Keep this for non-KeyArtPoster image fields; KeyArtPoster auto-fills */}
          {!isKeyArtPoster && canAutofill && isEmptyImage ? (
            <button
              className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 text-xs hover:bg-white/5"
              onClick={autofillFromPdfPage1}
              title="Auto-fill from PDF page 1"
            >
              Auto-fill
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        {isEmptyImage ? (
          <div className="text-sm text-slate-400">
            {canAutofill
              ? "Waiting for PDF image… (KeyArtPoster will auto-fill from page 1)."
              : "Upload a PDF first so we can extract page images."}
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={label}
            className="w-full max-h-[360px] object-contain rounded-md border border-slate-700 bg-black/20"
          />
        )}

        {/* If this field currently contains text (prompt), show it as text, not as <img src>. */}
        {promptText ? (
          <div className="mt-3 rounded-md border border-slate-700 bg-black/20 p-3">
            <div className="text-xs font-semibold text-slate-300 mb-1">
              Detected text in an image field (will NOT be used as an image URL)
            </div>
            <div className="text-xs text-slate-400 whitespace-pre-wrap">
              {truncate(promptText, 400)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

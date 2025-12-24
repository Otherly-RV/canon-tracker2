import React, { useEffect, useMemo } from "react";
import { useCompleteness } from "../context/CompletenessContext";
import { pickBestPageImageUrl } from "../data/image-picker";

function isLikelyUrl(s: string) {
  return /^https?:\/\/.+/i.test((s || "").trim()) || (s || "").startsWith("data:image/");
}

export default function ImageFieldSlot({ label, path }: { label: string; path: string }) {
  const { fieldContents, updateFieldContent, pdfPageImages } = useCompleteness();

  const value = useMemo(() => String(fieldContents.get(path) ?? ""), [fieldContents, path]);
  const url = isLikelyUrl(value) ? value : "";

  const bestGuessUrl = useMemo(() => {
    return pickBestPageImageUrl(path, pdfPageImages || []);
  }, [path, pdfPageImages]);

  const isEmpty = !url || url === "Unknown";

  // ✅ Auto-fill ONLY when empty and we have a best guess
  // (so everything won’t become identical)
  useEffect(() => {
    if (!isEmpty) return;
    if (!bestGuessUrl) return;

    // Auto-fill key posters + lead images; leave the rest manual for now
    const leaf = path.split(".").pop() || "";
    const shouldAutofill = leaf === "KeyArtPoster" || leaf === "LeadImage";

    if (shouldAutofill) updateFieldContent(path, bestGuessUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, bestGuessUrl, path]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm font-medium text-slate-400">{label}</div>

      <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
        {url ? (
          <div className="rounded-md overflow-hidden border border-slate-700 bg-slate-900/40">
            <img src={url} className="w-full h-44 object-cover block" />
          </div>
        ) : (
          <div className="text-slate-500 italic text-sm">
            No image assigned yet. {bestGuessUrl ? "Use Best-guess." : "Upload a PDF first."}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {bestGuessUrl ? (
            <button
              onClick={() => updateFieldContent(path, bestGuessUrl)}
              className="px-3 py-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm"
            >
              Best-guess
            </button>
          ) : null}

          <button
            onClick={() => updateFieldContent(path, "")}
            className="px-3 py-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm"
          >
            Clear
          </button>
        </div>

        {/* Keep prompt/description text if generator put text here */}
        {!url && value?.trim() && (
          <div className="mt-3 text-xs text-slate-300 whitespace-pre-wrap border border-slate-700 rounded-md p-3 bg-slate-900/40">
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

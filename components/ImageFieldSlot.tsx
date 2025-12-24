import React, { useEffect, useMemo } from "react";
import { useCompleteness } from "../context/CompletenessContext";

function isLikelyUrl(s: string) {
  return /^https?:\/\/.+/i.test((s || "").trim()) || (s || "").startsWith("data:image/");
}

export default function ImageFieldSlot({ label, path }: { label: string; path: string }) {
  const { fieldContents, updateFieldContent, pdfPageImages } = useCompleteness();

  const value = useMemo(() => fieldContents.get(path) ?? "", [fieldContents, path]);
  const url = isLikelyUrl(value) ? value : "";

  const isKeyArtPoster = path.endsWith(".KeyArtPoster");
  const page1Url = pdfPageImages?.[0]?.url || ""; // ✅ IMPORTANT: your type uses .url

  // ✅ Auto-assign KeyArtPoster to page 1 if empty/bad
  useEffect(() => {
    if (!isKeyArtPoster) return;
    if (!page1Url) return;
    if (url) return; // already a valid URL
    updateFieldContent(path, page1Url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKeyArtPoster, page1Url]);

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
            No image assigned yet.{" "}
            {isKeyArtPoster
              ? page1Url
                ? "KeyArtPoster will auto-fill from PDF page 1."
                : "Upload a PDF first."
              : "Upload a PDF first."}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!isKeyArtPoster && page1Url && !url ? (
            <button
              onClick={() => updateFieldContent(path, page1Url)}
              className="px-3 py-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm"
            >
              Auto-fill (Page 1)
            </button>
          ) : null}

          <button
            onClick={() => updateFieldContent(path, "")}
            className="px-3 py-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm"
          >
            Clear
          </button>
        </div>

        {/* Keep prompt/description text if user/generator put text here */}
        {!url && value?.trim() && (
          <div className="mt-3 text-xs text-slate-300 whitespace-pre-wrap border border-slate-700 rounded-md p-3 bg-slate-900/40">
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

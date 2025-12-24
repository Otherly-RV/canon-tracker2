import React, { useMemo, useState } from "react";
import { useCompleteness } from "../context/CompletenessContext";

function isLikelyUrl(s: string) {
  return /^https?:\/\/.+/i.test((s || "").trim());
}

export default function ImageFieldSlot({ label, path }: { label: string; path: string }) {
  const { fieldContents, updateFieldContent, pdfPageImages } = useCompleteness();
  const [open, setOpen] = useState(false);

  const value = useMemo(() => fieldContents.get(path) ?? "", [fieldContents, path]);
  const url = isLikelyUrl(value) ? value : "";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm font-medium text-slate-400">{label}</div>

      <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
        {url ? (
          <div className="rounded-md overflow-hidden border border-slate-700 bg-slate-900/40">
            <img src={url} className="w-full h-44 object-cover block" />
          </div>
        ) : (
          <div className="text-slate-500 italic text-sm">No image assigned.</div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={!pdfPageImages?.length}
            className="px-3 py-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Pick from PDF pages
          </button>

          <button
            onClick={() => updateFieldContent(path, "")}
            className="px-3 py-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm"
          >
            Clear
          </button>
        </div>

        {open && pdfPageImages?.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {pdfPageImages.map((p) => (
              <button
                key={p.page}
                onClick={() => {
                  updateFieldContent(path, p.url);
                  setOpen(false);
                }}
                className="rounded-md border border-slate-700 bg-slate-900/40 overflow-hidden text-left hover:border-slate-500"
                title={`Page ${p.page}`}
              >
                <img src={p.url} className="w-full h-24 object-cover block" />
                <div className="px-2 py-1 text-xs text-slate-300">Page {p.page}</div>
              </button>
            ))}
          </div>
        )}

        {/* If the field contains prompt text, show it below (optional) */}
        {!url && value?.trim() && (
          <div className="mt-3 text-xs text-slate-300 whitespace-pre-wrap border border-slate-700 rounded-md p-3 bg-slate-900/40">
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useMemo } from "react";
import { useCompleteness } from "../context/CompletenessContext";

type Props = {
  path: string;
  label: string;
};

export default function FieldDisplay({ path, label }: Props) {
  const { fieldContents, updateFieldContent } = useCompleteness();

  const value = useMemo(() => {
    const v = fieldContents.get(path);
    if (v === undefined || v === null) return "";
    return String(v);
  }, [fieldContents, path]);

  const isEmpty = value.trim().length === 0 || value === "Unknown";

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-200">{label}</div>
          <div className="mt-1 text-xs text-slate-400">{path}</div>
        </div>

        <div
          className={`text-xs px-2 py-1 rounded-full border ${
            isEmpty
              ? "border-amber-600/40 text-amber-300 bg-amber-900/10"
              : "border-emerald-600/40 text-emerald-300 bg-emerald-900/10"
          }`}
        >
          {isEmpty ? "missing" : "filled"}
        </div>
      </div>

      <textarea
        className="mt-3 w-full min-h-[96px] resize-y rounded-md border border-slate-700 bg-black/20 p-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-sky-600/40"
        placeholder='Type here… (or leave "Unknown")'
        value={value}
        onChange={(e) => updateFieldContent(path, e.target.value)}
      />
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Copy, Sparkles, X } from "lucide-react"
import { useCompleteness } from "../context/CompletenessContext.tsx"

type Props = {
    isOpen: boolean
    onClose: () => void
}

function stripJsonCodeFences(s: string) {
    return s
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim()
}

async function callGemini(prompt: string) {
    const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
    })
    const text = await r.text()

    let payload: any = null
    try {
        payload = JSON.parse(text)
    } catch {
        // ignore
    }

    if (!r.ok) throw new Error(payload?.error || `Gemini failed (${r.status})`)
    return String(payload?.text ?? text ?? "")
}

export default function ImagePromptModal({ isOpen, onClose }: Props) {
    const { canonText, imagePromptRules } = useCompleteness()

    const [request, setRequest] = useState("")
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [resultJson, setResultJson] = useState<string>("")

    useEffect(() => {
        if (!isOpen) return
        setRequest("")
        setErr(null)
        setResultJson("")
        setBusy(false)
    }, [isOpen])

    const canonSnippet = useMemo(() => (canonText || "").substring(0, 50000), [canonText])

    const onGenerate = async () => {
        setErr(null)
        setBusy(true)
        setResultJson("")

        try {
            const prompt = `
You generate production-ready text-to-image prompts.

IMAGE PROMPT RULES:
---
${imagePromptRules}
---

SOURCE CANON (may be truncated):
---
${canonSnippet}
---

REQUEST:
${request}

OUTPUT:
Return ONLY raw JSON (no markdown, no \`\`\` fences) with exactly these keys:
{
  "prompt": "string",
  "negative_prompt": "string",
  "tags": ["short", "tokens", "for", "lora"]
}

Notes:
- The prompt should be visually specific (camera, lighting, mood, environment, wardrobe/props).
- Tags should be short and reusable (character token, outfit token, hair token, props token, palette token, mood token).
`.trim()

            const out = await callGemini(prompt)

            // Normalize fences if model ignores instruction
            const cleaned = stripJsonCodeFences(out)
            const parsed = JSON.parse(cleaned)
            setResultJson(JSON.stringify(parsed, null, 2))
        } catch (e: any) {
            setErr(e?.message || "Failed to generate.")
        } finally {
            setBusy(false)
        }
    }

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(resultJson)
        } catch {
            // ignore
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) onClose()
                    }}
                >
                    <motion.div
                        className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
                        initial={{ y: 24, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 24, opacity: 0, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                            <div>
                                <div className="text-slate-100 font-semibold">Image Prompt Generator</div>
                                <div className="text-xs text-slate-400">
                                    Generates JSON: prompt + negative_prompt + LoRA tags.
                                </div>
                            </div>

                            <button
                                onClick={onClose}
                                className="p-2 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                                aria-label="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-3">
                            {err && (
                                <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/50 rounded-md p-3">
                                    {err}
                                </div>
                            )}

                            <textarea
                                value={request}
                                onChange={(e) => setRequest(e.target.value)}
                                placeholder='Example: "NEL in a rain-soaked alley at night, revolvers visible, cinematic noir lighting, 35mm, shallow depth of field"'
                                className="w-full h-28 bg-slate-900/60 border border-slate-700 rounded-lg p-4 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:outline-none resize-none"
                            />

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onGenerate}
                                    disabled={busy || !request.trim()}
                                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Sparkles size={16} />
                                    {busy ? "Generating…" : "Generate"}
                                </button>

                                <button
                                    onClick={onCopy}
                                    disabled={!resultJson}
                                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Copy size={16} />
                                    Copy JSON
                                </button>
                            </div>

                            <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                                {resultJson ? (
                                    <pre className="whitespace-pre-wrap text-slate-200 text-sm font-mono">
                                        {resultJson}
                                    </pre>
                                ) : (
                                    <div className="text-slate-500 text-sm">
                                        Generate to see the JSON output here.
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

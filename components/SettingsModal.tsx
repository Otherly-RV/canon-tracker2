import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Copy, Save, Settings, X, Download } from "lucide-react"
import { useCompleteness } from "../context/CompletenessContext.tsx"

type Tab = "contract" | "rules" | "pdf" | "image"

const Editor: React.FC<{
    value: string
    onChange: (val: string) => void
    placeholder?: string
}> = ({ value, onChange, placeholder }) => (
    <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-[55vh] bg-slate-900/60 border border-slate-700 rounded-lg p-4 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:outline-none resize-none font-mono text-sm"
    />
)

const Tabs: React.FC<{ active: Tab; setActive: (t: Tab) => void }> = ({ active, setActive }) => {
    const base =
        "px-3 py-2 rounded-md text-sm transition-colors border border-transparent"
    const activeCls = "bg-slate-800 text-white border-slate-700"
    const idleCls = "text-slate-300 hover:bg-slate-800/60"

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button className={`${base} ${active === "contract" ? activeCls : idleCls}`} onClick={() => setActive("contract")}>
                Exec Contract
            </button>
            <button className={`${base} ${active === "rules" ? activeCls : idleCls}`} onClick={() => setActive("rules")}>
                Field Rules (JSON)
            </button>
            <button className={`${base} ${active === "pdf" ? activeCls : idleCls}`} onClick={() => setActive("pdf")}>
                PDF Extraction Rules
            </button>
            <button className={`${base} ${active === "image" ? activeCls : idleCls}`} onClick={() => setActive("image")}>
                Image Prompt Rules
            </button>
        </div>
    )
}

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const {
        execContractText,
        setExecContractText,
        fieldRules,
        setFieldRules,
        pdfExtractionRules,
        setPdfExtractionRules,
        imagePromptRules,
        setImagePromptRules,
    } = useCompleteness()

    const [activeTab, setActiveTab] = useState<Tab>("contract")

    const [localContract, setLocalContract] = useState("")
    const [localRules, setLocalRules] = useState("")
    const [localPdfRules, setLocalPdfRules] = useState("")
    const [localImageRules, setLocalImageRules] = useState("")

    const [copyMsg, setCopyMsg] = useState("")
    const [rulesError, setRulesError] = useState<string | null>(null)

    const currentPayload = useMemo(() => {
        if (activeTab === "contract") return localContract
        if (activeTab === "rules") return localRules
        if (activeTab === "pdf") return localPdfRules
        return localImageRules
    }, [activeTab, localContract, localRules, localPdfRules, localImageRules])

    useEffect(() => {
        if (!isOpen) return
        setActiveTab("contract")
        setLocalContract(execContractText || "")
        setLocalRules(JSON.stringify(fieldRules ?? {}, null, 2))
        setLocalPdfRules(pdfExtractionRules || "")
        setLocalImageRules(imagePromptRules || "")
        setRulesError(null)
        setCopyMsg("")
    }, [isOpen, execContractText, fieldRules, pdfExtractionRules, imagePromptRules])

    const handleSave = () => {
        if (activeTab === "contract") {
            setExecContractText(localContract)
            setCopyMsg("Saved.")
            setTimeout(() => setCopyMsg(""), 1200)
            return
        }

        if (activeTab === "rules") {
            try {
                const parsed = JSON.parse(localRules)
                setFieldRules(parsed)
                setRulesError(null)
                setCopyMsg("Saved.")
                setTimeout(() => setCopyMsg(""), 1200)
            } catch (e: any) {
                setRulesError(e?.message || "Invalid JSON.")
            }
            return
        }

        if (activeTab === "pdf") {
            setPdfExtractionRules(localPdfRules)
            setCopyMsg("Saved.")
            setTimeout(() => setCopyMsg(""), 1200)
            return
        }

        setImagePromptRules(localImageRules)
        setCopyMsg("Saved.")
        setTimeout(() => setCopyMsg(""), 1200)
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(currentPayload)
            setCopyMsg("Copied.")
            setTimeout(() => setCopyMsg(""), 900)
        } catch {
            setCopyMsg("Copy failed.")
            setTimeout(() => setCopyMsg(""), 900)
        }
    }

    const handleDownloadRulesJson = () => {
        const blob = new Blob([localRules], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "field-rules.json"
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
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
                        className="w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
                        initial={{ y: 24, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 24, opacity: 0, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-md bg-slate-800 flex items-center justify-center text-slate-200">
                                    <Settings size={18} />
                                </div>
                                <div>
                                    <div className="text-slate-100 font-semibold">Settings</div>
                                    <div className="text-xs text-slate-400">
                                        Saved settings persist across sessions (localStorage).
                                    </div>
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

                        <div className="px-6 py-4 border-b border-slate-800">
                            <Tabs active={activeTab} setActive={setActiveTab} />
                        </div>

                        <div className="px-6 py-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs text-slate-400">
                                    {activeTab === "rules"
                                        ? "Edit JSON carefully. Invalid JSON will not save."
                                        : "Edit and Save."}
                                </div>

                                <div className="flex items-center gap-2">
                                    {copyMsg && <span className="text-xs text-emerald-300">{copyMsg}</span>}
                                    {activeTab === "rules" && (
                                        <button
                                            onClick={handleDownloadRulesJson}
                                            className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                                        >
                                            <Download size={16} />
                                            Download JSON
                                        </button>
                                    )}
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                                    >
                                        <Copy size={16} />
                                        Copy
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                                    >
                                        <Save size={16} />
                                        Save
                                    </button>
                                </div>
                            </div>

                            {rulesError && (
                                <div className="mb-3 text-sm text-red-300 bg-red-950/40 border border-red-900/50 rounded-md p-3">
                                    {rulesError}
                                </div>
                            )}

                            {activeTab === "contract" && (
                                <Editor value={localContract} onChange={setLocalContract} />
                            )}

                            {activeTab === "rules" && <Editor value={localRules} onChange={setLocalRules} />}

                            {activeTab === "pdf" && (
                                <Editor
                                    value={localPdfRules}
                                    onChange={setLocalPdfRules}
                                    placeholder="Rules for interpreting extracted PDF/DOCX text."
                                />
                            )}

                            {activeTab === "image" && (
                                <Editor
                                    value={localImageRules}
                                    onChange={setLocalImageRules}
                                    placeholder="Rules for generating production image prompts + LoRA tags."
                                />
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

export default SettingsModal

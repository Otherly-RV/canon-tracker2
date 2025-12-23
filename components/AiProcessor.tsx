import React, { useState, useCallback } from "react"
import { BrainCircuit, CheckCircle, XCircle, RotateCcw, Search } from "lucide-react"
import { useCompleteness } from "../context/CompletenessContext.tsx"
import { useAiAnalysis } from "../hooks/useAiAnalysis.ts"
import { ProcessingStatus } from "../types.ts"
import { getStaticChecklist, COMPLETENESS_FIELD_CHECKLIST } from "../data/rules.ts"

const AiProcessor: React.FC = () => {
    const [status, setStatus] = useState<ProcessingStatus>("idle")
    const [error, setError] = useState<string | null>(null)
    const [progress, setProgress] = useState({ current: 0, total: 0 })

    const {
        updateFieldContent,
        resetCompleteness,
        generateAllItems,
        identifiedEntities,
        setIdentifiedEntities,
        canonText,
        execContractText,
        fieldRules,
        pdfExtractionRules,
    } = useCompleteness()

    const { identifyEntities, generateContentForAllFields } = useAiAnalysis()

    const contractBundle = `${execContractText}

[PDF EXTRACTION RULES]
${pdfExtractionRules}
`.trim()

    const generateAllItemsLocal = useCallback(
        (entities: { characters: string[]; locations: string[] }) => {
            let dynamicItems: string[] = []
            const staticItems = getStaticChecklist(COMPLETENESS_FIELD_CHECKLIST)

            entities.characters.forEach((char) => {
                const charTemplateL2 = COMPLETENESS_FIELD_CHECKLIST.L2.CHARACTERS.Character
                if (charTemplateL2) dynamicItems.push(...getStaticChecklist(charTemplateL2, `L2.CHARACTERS.${char}`))
                const charTemplateL3 = COMPLETENESS_FIELD_CHECKLIST.L3.CHARACTERS.Character
                if (charTemplateL3) dynamicItems.push(...getStaticChecklist(charTemplateL3, `L3.CHARACTERS.${char}`))
            })

            entities.locations.forEach((loc) => {
                const locTemplateL2 = COMPLETENESS_FIELD_CHECKLIST.L2.WORLD.Locations.Location
                if (locTemplateL2) dynamicItems.push(...getStaticChecklist(locTemplateL2, `L2.WORLD.Locations.${loc}`))
                const locTemplateL3 = COMPLETENESS_FIELD_CHECKLIST.L3.WORLD.Locations.Location
                if (locTemplateL3) dynamicItems.push(...getStaticChecklist(locTemplateL3, `L3.WORLD.Locations.${loc}`))
            })

            generateAllItems(entities as any)
            return [...staticItems, ...dynamicItems]
        },
        [generateAllItems]
    )

    const handleProcess = useCallback(async () => {
        setError(null)

        if (!canonText || !canonText.trim()) {
            setError("Canon is empty. Open Canon and paste/upload a document, then Save.")
            setStatus("error")
            return
        }

        try {
            setStatus("identifying")
            setProgress({ current: 0, total: 0 })

            // Stage 1: Identify Entities
            const entities = await identifyEntities(canonText, contractBundle)
            setIdentifiedEntities(entities)

            // Generate the full dynamic checklist
            const all = generateAllItemsLocal(entities)

            // Stage 2: Generate field content
            setStatus("analyzing")
            setProgress({ current: 0, total: all.length })

            await generateContentForAllFields(
                canonText,
                all,
                contractBundle,
                fieldRules,
                (path, content) => {
                    updateFieldContent(path, content)
                    setProgress((p) => ({ ...p, current: p.current + 1 }))
                }
            )

            setStatus("success")
        } catch (e: any) {
            setError(e?.message || "AI processing failed.")
            setStatus("error")
        }
    }, [
        canonText,
        contractBundle,
        identifyEntities,
        setIdentifiedEntities,
        generateAllItemsLocal,
        generateContentForAllFields,
        fieldRules,
        updateFieldContent,
    ])

    const statusIcon =
        status === "success" ? (
            <CheckCircle size={18} />
        ) : status === "error" ? (
            <XCircle size={18} />
        ) : status === "analyzing" || status === "identifying" ? (
            <Search size={18} />
        ) : (
            <BrainCircuit size={18} />
        )

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleProcess}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-500 transition-colors"
                aria-label="Run AI processing"
            >
                {statusIcon}
                <span className="text-sm font-medium">
                    {status === "identifying"
                        ? "Identifying…"
                        : status === "analyzing"
                        ? "Generating…"
                        : "Process"}
                </span>
            </button>

            <button
                onClick={() => {
                    resetCompleteness()
                    setStatus("idle")
                    setError(null)
                    setProgress({ current: 0, total: 0 })
                }}
                className="flex items-center justify-center w-9 h-9 bg-slate-800 text-slate-200 rounded-md hover:bg-slate-700 transition-colors"
                aria-label="Reset"
            >
                <RotateCcw size={18} />
            </button>

            {progress.total > 0 && (
                <div className="text-xs text-slate-400">
                    {progress.current} / {progress.total}
                </div>
            )}

            {error && <div className="text-xs text-red-300 max-w-[380px] truncate">{error}</div>}
        </div>
    )
}

export default AiProcessor

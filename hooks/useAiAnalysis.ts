import { useState, useCallback } from "react"
import { buildFieldPrompt } from "../utils/prompt-builder"
import { IdentifiedEntities } from "../types"

async function callGemini(prompt: string): Promise<string> {
    const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
    })

    const bodyText = await r.text()

    // Try JSON first (expected: {"text":"..."})
    let payload: any = null
    try {
        payload = JSON.parse(bodyText)
    } catch {
        // if it's not JSON, keep raw text
    }

    if (!r.ok) {
        const msg =
            payload?.error ||
            `Gemini request failed (${r.status})`
        throw new Error(msg)
    }

    const text = payload?.text ?? bodyText
    return String(text ?? "")
}

function stripJsonCodeFences(s: string): string {
    // Handles:
    // ```json
    // { ... }
    // ```
    // and also ``` ... ```
    return s
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim()
}

function safeParseEntitiesJson(text: string): IdentifiedEntities {
    const cleaned = stripJsonCodeFences(text)

    let parsed: any
    try {
        parsed = JSON.parse(cleaned)
    } catch (e) {
        // Give a helpful error for debugging
        throw new Error(
            `Gemini returned invalid JSON. Raw:\n${text}`
        )
    }

    const characters = Array.isArray(parsed?.characters)
        ? parsed.characters.map(String)
        : []
    const locations = Array.isArray(parsed?.locations)
        ? parsed.locations.map(String)
        : []

    return { characters, locations }
}

export const useAiAnalysis = () => {
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const identifyEntities = useCallback(
        async (
            documentText: string,
            execContractText: string
        ): Promise<IdentifiedEntities> => {
            // Keep this strict; still strip fences just in case.
            const prompt = `
${execContractText}

TASK:
Extract main characters and main locations from the source document.

Return ONLY raw JSON (no markdown, no \`\`\` fences) exactly in this shape:
{"characters":["..."],"locations":["..."]}

SOURCE:
---
${String(documentText || "").substring(0, 50000)}
---
`.trim()

            const text = await callGemini(prompt)
            return safeParseEntitiesJson(text)
        },
        []
    )

    const generateContentForAllFields = useCallback(
        async (
            documentText: string,
            checklistItems: string[],
            execContractText: string,
            fieldRules: any,
            onFieldCompleted: (path: string, content: string) => void
        ) => {
            setIsAnalyzing(true)
            setError(null)

            try {
                for (const fieldPath of checklistItems) {
                    const prompt = buildFieldPrompt(
                        fieldPath,
                        documentText,
                        execContractText,
                        fieldRules
                    )

                    const text = await callGemini(prompt)
                    onFieldCompleted(fieldPath, text.trim())
                }
            } catch (e: any) {
                const msg = e?.message || "Generation failed"
                setError(msg)
                setIsAnalyzing(false)
                throw e
            }

            setIsAnalyzing(false)
        },
        []
    )

    return {
        identifyEntities,
        generateContentForAllFields,
        isAnalyzing,
        error,
    }
}

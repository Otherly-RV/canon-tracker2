import React, {
    createContext,
    useState,
    useMemo,
    useCallback,
    useContext,
    ReactNode,
    useEffect,
} from "react"
import {
    COMPLETENESS_FIELD_CHECKLIST,
    getStaticChecklist,
    INITIAL_FIELD_RULES,
} from "../data/rules.ts"
import { CORE_OTHERLY_EXEC_PERSONA } from "../data/IPBRAIN-CANON.ts"
import {
    CompletenessContextType,
    CompletenessResult,
    IdentifiedEntities,
    ExtractedContent,
} from "../types.ts"

const CompletenessContext = createContext<CompletenessContextType | undefined>(undefined)

// -----------------------------
// LocalStorage helpers
// -----------------------------
const LS = {
    canonText: "otherly.canonText",
    execContractText: "otherly.execContractText",
    fieldRules: "otherly.fieldRules",
    pdfExtractionRules: "otherly.pdfExtractionRules",
    imagePromptRules: "otherly.imagePromptRules",
}

function hasWindow() {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function loadString(key: string, fallback: string) {
    if (!hasWindow()) return fallback
    try {
        const v = window.localStorage.getItem(key)
        return v === null ? fallback : v
    } catch {
        return fallback
    }
}

function saveString(key: string, value: string) {
    if (!hasWindow()) return
    try {
        window.localStorage.setItem(key, value)
    } catch {
        // ignore quota / privacy mode errors
    }
}

function loadJson<T>(key: string, fallback: T): T {
    if (!hasWindow()) return fallback
    try {
        const v = window.localStorage.getItem(key)
        if (!v) return fallback
        return JSON.parse(v) as T
    } catch {
        return fallback
    }
}

function saveJson(key: string, value: any) {
    if (!hasWindow()) return
    try {
        window.localStorage.setItem(key, JSON.stringify(value, null, 2))
    } catch {
        // ignore
    }
}

// -----------------------------
// Defaults for new settings
// -----------------------------
const DEFAULT_PDF_EXTRACTION_RULES = `
PDF EXTRACTION RULES (for messy PDFs / OCR):
- Prefer headings, character lists, and scene/location labels as truth.
- If the extracted text contains broken lines, reconstruct sentences logically.
- Ignore page numbers, headers/footers, and repeated boilerplate.
- If names appear with variants (e.g., "The Killer" vs "Killer"), keep the most canonical form.
- If uncertain, do not invent. Leave fields empty rather than guessing.
`.trim()

const DEFAULT_IMAGE_PROMPT_RULES = `
IMAGE PROMPT RULES (text-to-image prompt generation):
- Output must be production-ready: concise but specific.
- Always include: subject, composition/camera, lighting, mood, environment, wardrobe/props, and style notes.
- Also output a negative_prompt to avoid artifacts.
- Also output LoRA-friendly tags (short tokens) for: character, outfit, hair, signature props, palette, mood.
- Do not mention real artists. Do not use copyrighted IP references.
`.trim()

export const CompletenessProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [fieldContents, setFieldContents] = useState<Map<string, string>>(new Map())
    const [identifiedEntities, setIdentifiedEntities] = useState<IdentifiedEntities>({
        characters: [],
        locations: [],
    })
    const [allItems, setAllItems] = useState<string[]>([])

    // Persistent state for canon and rules
    const [canonText, setCanonText] = useState<string>(() => loadString(LS.canonText, ""))
    const [execContractText, setExecContractText] = useState<string>(() =>
        loadString(LS.execContractText, CORE_OTHERLY_EXEC_PERSONA)
    )
    const [fieldRules, setFieldRules] = useState<any>(() => loadJson(LS.fieldRules, INITIAL_FIELD_RULES))

    const [pdfExtractionRules, setPdfExtractionRules] = useState<string>(() =>
        loadString(LS.pdfExtractionRules, DEFAULT_PDF_EXTRACTION_RULES)
    )
    const [imagePromptRules, setImagePromptRules] = useState<string>(() =>
        loadString(LS.imagePromptRules, DEFAULT_IMAGE_PROMPT_RULES)
    )

    // State for Canon Viewer
    const [extractedContent, setExtractedContent] = useState<ExtractedContent | null>(null)
    const [isViewerVisible, setIsViewerVisible] = useState<boolean>(false)

    // Persist on change
    useEffect(() => saveString(LS.canonText, canonText), [canonText])
    useEffect(() => saveString(LS.execContractText, execContractText), [execContractText])
    useEffect(() => saveJson(LS.fieldRules, fieldRules), [fieldRules])
    useEffect(() => saveString(LS.pdfExtractionRules, pdfExtractionRules), [pdfExtractionRules])
    useEffect(() => saveString(LS.imagePromptRules, imagePromptRules), [imagePromptRules])

    const generateAllItems = useCallback((entities: IdentifiedEntities) => {
        let dynamicItems: string[] = []
        const staticItems = getStaticChecklist(COMPLETENESS_FIELD_CHECKLIST)

        entities.characters.forEach((charName) => {
            const charTemplateL2 = COMPLETENESS_FIELD_CHECKLIST.L2.CHARACTERS.Character
            if (charTemplateL2) dynamicItems.push(...getStaticChecklist(charTemplateL2, `L2.CHARACTERS.${charName}`))
            const charTemplateL3 = COMPLETENESS_FIELD_CHECKLIST.L3.CHARACTERS.Character
            if (charTemplateL3) dynamicItems.push(...getStaticChecklist(charTemplateL3, `L3.CHARACTERS.${charName}`))
        })

        entities.locations.forEach((locName) => {
            const locTemplateL2 = COMPLETENESS_FIELD_CHECKLIST.L2.WORLD.Locations.Location
            if (locTemplateL2) dynamicItems.push(...getStaticChecklist(locTemplateL2, `L2.WORLD.Locations.${locName}`))
            const locTemplateL3 = COMPLETENESS_FIELD_CHECKLIST.L3.WORLD.Locations.Location
            if (locTemplateL3) dynamicItems.push(...getStaticChecklist(locTemplateL3, `L3.WORLD.Locations.${locName}`))
        })

        setAllItems([...staticItems, ...dynamicItems])
    }, [])

    const updateFieldContent = useCallback((path: string, content: string) => {
        setFieldContents((prev) => new Map(prev).set(path, content))
    }, [])

    const resetCompleteness = useCallback(() => {
        setFieldContents(new Map())
        setIdentifiedEntities({ characters: [], locations: [] })
        setAllItems([])
        setExtractedContent(null)
        setIsViewerVisible(false)
    }, [])

    const getCompletenessForPath = useCallback(
        (path: string): CompletenessResult => {
            const isDomainQuery = !path.startsWith("L")
            const relevantItems = allItems.filter((item) =>
                isDomainQuery ? item.split(".")[1] === path : item.startsWith(path)
            )
            const total = relevantItems.length
            const completed = relevantItems.filter((item) => {
                const content = fieldContents.get(item)
                return content !== undefined && content.trim() !== ""
            }).length
            const percentage = total === 0 ? 0 : Math.round((completed / total) * 100)
            return { completed, total, percentage }
        },
        [allItems, fieldContents]
    )

    const value = useMemo<CompletenessContextType>(
        () => ({
            fieldContents,
            updateFieldContent,
            resetCompleteness,
            getCompletenessForPath,

            identifiedEntities,
            setIdentifiedEntities,
            allItems,
            generateAllItems,

            canonText,
            setCanonText,
            execContractText,
            setExecContractText,
            fieldRules,
            setFieldRules,

            pdfExtractionRules,
            setPdfExtractionRules,
            imagePromptRules,
            setImagePromptRules,

            extractedContent,
            setExtractedContent,
            isViewerVisible,
            setIsViewerVisible,
        }),
        [
            fieldContents,
            updateFieldContent,
            resetCompleteness,
            getCompletenessForPath,
            identifiedEntities,
            setIdentifiedEntities,
            allItems,
            generateAllItems,
            canonText,
            execContractText,
            fieldRules,
            pdfExtractionRules,
            imagePromptRules,
            extractedContent,
            isViewerVisible,
        ]
    )

    return <CompletenessContext.Provider value={value}>{children}</CompletenessContext.Provider>
}

export const useCompleteness = (): CompletenessContextType => {
    const context = useContext(CompletenessContext)
    if (context === undefined) throw new Error("useCompleteness must be used within a CompletenessProvider")
    return context
}

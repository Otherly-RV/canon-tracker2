import { ChecklistNode, ChecklistLeaf } from "./data/rules.ts"

export type Level = "L1" | "L2" | "L3"
export type Domain = "OVERVIEW" | "CHARACTERS" | "WORLD" | "LORE" | "STYLE" | "STORY"

export type CompletenessResult = {
    completed: number
    total: number
    percentage: number
}

export type IdentifiedEntities = {
    characters: string[]
    locations: string[]
}

export type ExtractedContent = {
    content: string
    format: "text" | "html"
}

export interface CompletenessContextType {
    fieldContents: Map<string, string>
    updateFieldContent: (path: string, content: string) => void
    resetCompleteness: () => void
    getCompletenessForPath: (path: string) => CompletenessResult

    // Dynamic entity and checklist management
    identifiedEntities: IdentifiedEntities
    setIdentifiedEntities: (entities: IdentifiedEntities) => void
    allItems: string[] // Now dynamically generated
    generateAllItems: (entities: IdentifiedEntities) => void

    // Canon and Rules Management
    canonText: string
    setCanonText: (text: string) => void

    execContractText: string
    setExecContractText: (text: string) => void

    fieldRules: any // editable JSON rules blob
    setFieldRules: (rules: any) => void

    // New: production rules
    pdfExtractionRules: string
    setPdfExtractionRules: (text: string) => void

    imagePromptRules: string
    setImagePromptRules: (text: string) => void

    // Canon Viewer
    extractedContent: ExtractedContent | null
    setExtractedContent: (content: ExtractedContent | null) => void
    isViewerVisible: boolean
    setIsViewerVisible: (visible: boolean) => void
}

export interface ChecklistRendererProps {
    data: ChecklistNode | ChecklistLeaf
    pathPrefix: string
}

export type ProcessingStatus = "idle" | "identifying" | "analyzing" | "success" | "error"

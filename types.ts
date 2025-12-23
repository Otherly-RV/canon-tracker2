import { ChecklistNode, ChecklistLeaf } from "./data/rules.ts";

export type Level = "L1" | "L2" | "L3";
export type Domain = "OVERVIEW" | "CHARACTERS" | "WORLD" | "LORE" | "STYLE" | "STORY";

export type CompletenessResult = {
  completed: number;
  total: number;
  percentage: number;
};

export type IdentifiedEntities = {
  characters: string[];
  locations: string[];
};

export type ExtractedContent = {
  content: string;
  format: "text" | "html";
};

export type PdfPageImage = {
  page: number; // 1-based
  url: string;  // Blob URL
  width: number;
  height: number;
};

export interface CompletenessContextType {
  fieldContents: Map<string, string>;
  updateFieldContent: (path: string, content: string) => void;
  resetCompleteness: () => void;
  getCompletenessForPath: (path: string) => CompletenessResult;

  // Dynamic entity and checklist management
  identifiedEntities: IdentifiedEntities;
  setIdentifiedEntities: (entities: IdentifiedEntities) => void;
  allItems: string[];
  generateAllItems: (entities: IdentifiedEntities) => void;

  // Canon and Rules Management
  canonText: string;
  setCanonText: (text: string) => void;
  execContractText: string;
  setExecContractText: (text: string) => void;
  fieldRules: any;
  setFieldRules: (rules: any) => void;

  // PDF assets (extracted page images from DocAI)
  pdfBlobUrl: string | null;
  setPdfBlobUrl: (url: string | null) => void;
  pdfPageImages: PdfPageImage[];
  setPdfPageImages: (imgs: PdfPageImage[]) => void;

  // Canon Viewer
  extractedContent: ExtractedContent | null;
  setExtractedContent: (content: ExtractedContent | null) => void;
  isViewerVisible: boolean;
  setIsViewerVisible: (visible: boolean) => void;
}

export interface ChecklistRendererProps {
  data: ChecklistNode | ChecklistLeaf;
  pathPrefix: string;
}

export type ProcessingStatus = "idle" | "identifying" | "analyzing" | "success" | "error";

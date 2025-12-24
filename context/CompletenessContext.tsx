"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";

/* -----------------------------
   Types
----------------------------- */

export type PdfPageImage = {
  page: number;
  imageUrl: string;
  width?: number;
  height?: number;
};

type CompletenessContextType = {
  // PDF ingestion outputs
  pdfBlobUrl: string | null;
  setPdfBlobUrl: (v: string | null) => void;

  pdfManifestUrl: string | null;
  setPdfManifestUrl: (v: string | null) => void;

  pdfPageImages: PdfPageImage[];
  setPdfPageImages: (v: PdfPageImage[]) => void;

  // Text
  canonText: string;
  setCanonText: (v: string) => void;

  // Viewer
  isViewerVisible: boolean;
  setIsViewerVisible: (v: boolean) => void;

  // Reset
  resetCompleteness: () => void;
};

/* -----------------------------
   Context
----------------------------- */

const CompletenessContext = createContext<
  CompletenessContextType | undefined
>(undefined);

/* -----------------------------
   Provider
----------------------------- */

export function CompletenessProvider({ children }: { children: ReactNode }) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfManifestUrl, setPdfManifestUrl] = useState<string | null>(null);
  const [pdfPageImages, setPdfPageImages] = useState<PdfPageImage[]>([]);

  const [canonText, setCanonText] = useState<string>("");

  const [isViewerVisible, setIsViewerVisible] = useState<boolean>(false);

  const resetCompleteness = () => {
    setPdfBlobUrl(null);
    setPdfManifestUrl(null);
    setPdfPageImages([]);
    setCanonText("");
    setIsViewerVisible(false);
  };

  return (
    <CompletenessContext.Provider
      value={{
        pdfBlobUrl,
        setPdfBlobUrl,

        pdfManifestUrl,
        setPdfManifestUrl,

        pdfPageImages,
        setPdfPageImages,

        canonText,
        setCanonText,

        isViewerVisible,
        setIsViewerVisible,

        resetCompleteness,
      }}
    >
      {children}
    </CompletenessContext.Provider>
  );
}

/* -----------------------------
   Hook
----------------------------- */

export function useCompleteness() {
  const ctx = useContext(CompletenessContext);
  if (!ctx) {
    throw new Error(
      "useCompleteness must be used within a CompletenessProvider"
    );
  }
  return ctx;
}

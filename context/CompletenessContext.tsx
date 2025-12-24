import React, {
  createContext,
  useState,
  useMemo,
  useCallback,
  useContext,
  ReactNode,
} from "react";

import {
  COMPLETENESS_FIELD_CHECKLIST,
  getStaticChecklist,
  INITIAL_FIELD_RULES,
} from "../data/rules";
import { CORE_OTHERLY_EXEC_PERSONA } from "../data/IPBRAIN-CANON";

import type {
  CompletenessContextType,
  CompletenessResult,
  IdentifiedEntities,
  ExtractedContent,
  PdfPageImage,
} from "../types";

const CompletenessContext = createContext<CompletenessContextType | undefined>(undefined);

export const CompletenessProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [fieldContents, setFieldContents] = useState<Map<string, string>>(new Map());

  const [identifiedEntities, setIdentifiedEntities] = useState<IdentifiedEntities>({
    characters: [],
    locations: [],
  });

  const [allItems, setAllItems] = useState<string[]>([]);

  const [canonText, setCanonText] = useState<string>("");
  const [execContractText, setExecContractText] = useState<string>(CORE_OTHERLY_EXEC_PERSONA);
  const [fieldRules, setFieldRules] = useState<any>(INITIAL_FIELD_RULES);

  // NEW: PDF assets
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfPageImages, setPdfPageImages] = useState<PdfPageImage[]>([]);

  // Canon viewer
  const [extractedContent, setExtractedContent] = useState<ExtractedContent | null>(null);
  const [isViewerVisible, setIsViewerVisible] = useState<boolean>(false);

  const generateAllItems = useCallback((entities: IdentifiedEntities) => {
    const dynamicItems: string[] = [];
    const staticItems = getStaticChecklist(COMPLETENESS_FIELD_CHECKLIST);

    entities.characters.forEach((charName) => {
      const charTemplateL2 = (COMPLETENESS_FIELD_CHECKLIST as any).L2?.CHARACTERS?.Character;
      if (charTemplateL2) dynamicItems.push(...getStaticChecklist(charTemplateL2, `L2.CHARACTERS.${charName}`));

      const charTemplateL3 = (COMPLETENESS_FIELD_CHECKLIST as any).L3?.CHARACTERS?.Character;
      if (charTemplateL3) dynamicItems.push(...getStaticChecklist(charTemplateL3, `L3.CHARACTERS.${charName}`));
    });

    entities.locations.forEach((locName) => {
      const locTemplateL2 = (COMPLETENESS_FIELD_CHECKLIST as any).L2?.WORLD?.Locations?.Location;
      if (locTemplateL2) dynamicItems.push(...getStaticChecklist(locTemplateL2, `L2.WORLD.Locations.${locName}`));

      const locTemplateL3 = (COMPLETENESS_FIELD_CHECKLIST as any).L3?.WORLD?.Locations?.Location;
      if (locTemplateL3) dynamicItems.push(...getStaticChecklist(locTemplateL3, `L3.WORLD.Locations.${locName}`));
    });

    setAllItems([...staticItems, ...dynamicItems]);
  }, []);

  const updateFieldContent = useCallback((path: string, content: string) => {
    setFieldContents((prev) => {
      const next = new Map(prev);
      next.set(path, content);
      return next;
    });
  }, []);

  const resetCompleteness = useCallback(() => {
    setFieldContents(new Map());
    setIdentifiedEntities({ characters: [], locations: [] });
    setAllItems([]);

    // reset pdf assets
    setPdfBlobUrl(null);
    setPdfPageImages([]);

    setExtractedContent(null);
    setIsViewerVisible(false);
  }, []);

  const getCompletenessForPath = useCallback(
    (path: string): CompletenessResult => {
      const isDomainQuery = !path.startsWith("L");
      const relevantItems = allItems.filter((item) =>
        isDomainQuery ? item.split(".")[1] === path : item.startsWith(path)
      );

      const total = relevantItems.length;
      if (total === 0) return { completed: 0, total: 0, percentage: 0 };

      const completed = relevantItems.reduce((acc, item) => {
        const content = fieldContents.get(item);
        return acc + (content && content.trim() !== "" && content !== "No content generated" ? 1 : 0);
      }, 0);

      const percentage = Math.round((completed / total) * 100);
      return { completed, total, percentage };
    },
    [fieldContents, allItems]
  );

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

      pdfBlobUrl,
      setPdfBlobUrl,
      pdfPageImages,
      setPdfPageImages,

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
      allItems,
      generateAllItems,
      canonText,
      execContractText,
      fieldRules,
      pdfBlobUrl,
      pdfPageImages,
      extractedContent,
      isViewerVisible,
    ]
  );

  return <CompletenessContext.Provider value={value}>{children}</CompletenessContext.Provider>;
};

export const useCompleteness = (): CompletenessContextType => {
  const ctx = useContext(CompletenessContext);
  if (!ctx) throw new Error("useCompleteness must be used within a CompletenessProvider");
  return ctx;
};

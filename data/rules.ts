// -----------------------------------------------------------------------------
// Backwards-compat exports (required by existing app code)
// - Keeps rules.ts as single source of truth, but restores the exports the UI uses.
// -----------------------------------------------------------------------------

/**
 * Flatten ONLY the "static" checklist paths.
 * We skip template nodes that are instantiated later (Character / Location).
 */
export function getStaticChecklist(
  node: ChecklistNode | ChecklistLeaf,
  prefix = ""
): string[] {
  const out: string[] = [];

  if (Array.isArray(node)) {
    for (const field of node) out.push(`${prefix}.${field}`);
    return out;
  }

  for (const [k, v] of Object.entries(node)) {
    // These are templates that get instantiated into named cards later.
    if (k === "Character" || k === "Location") continue;

    const next = prefix ? `${prefix}.${k}` : k;

    if (Array.isArray(v)) {
      for (const field of v) out.push(`${next}.${field}`);
    } else {
      out.push(...getStaticChecklist(v as ChecklistNode, next));
    }
  }

  return out;
}

/**
 * What Settings panel shows/edits as "Field Rules".
 * Must be JSON-serializable (no functions).
 */
export const INITIAL_FIELD_RULES = {
  meta: {
    name: "OTHERLY_RULES",
    format: "json-data",
    notes: [
      "Data-only rules for upload/storage.",
      "No TypeScript syntax. No functions.",
      "Use limits as structured data; UI/prompt builder can render limit lines.",
    ],
  },
  types: {
    Level: ["L1", "L2", "L3"],
    Domain: ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "STYLE", "STORY"],
  },
  limits: LIMITS,
  checklist: COMPLETENESS_FIELD_CHECKLIST,
  prompt: {
    precedence: PROMPT_PRECEDENCE,
    assemblyOrder: PROMPT_ASSEMBLY_ORDER,
    globalOutput: RULE_GLOBAL_OUTPUT,
    canonDiscipline: RULE_CANON_DISCIPLINE,
  },
} as const;

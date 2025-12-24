// rules.ts
// OTHERLY / IP-BRAIN — Completeness + LLM Rule
// - L1 = KeyPoster-only deliverable (via Cover Prompt).
// - L2 = Development / Bible (text-first + light reference images).
// - L3 = Production-propedeutic (triggers/tags/packs + production story planning).

// -----------------------------
// Types
// -----------------------------

export type Level = "L1" | "L2" | "L3"

export type Domain =
  | "OVERVIEW"
  | "CHARACTERS"
  | "WORLD"
  | "LORE"
  | "STYLE"
  | "STORY"

export type ChecklistLeaf = readonly string[]
export type ChecklistNode = { readonly [k: string]: ChecklistLeaf | ChecklistNode }

// -----------------------------
// Limits (words primary, tokens optional safety cap)
// -----------------------------

export type LimitSpec = {
  wordLimit?: number
  tokenLimit?: number
}

export const LIMITS = {
  // L1
  L1_COVER_PROMPT: { wordLimit: 35, tokenLimit: 80 },

  // L2
  L2_TINY: { wordLimit: 8, tokenLimit: 24 },
  L2_SHORT: { wordLimit: 20, tokenLimit: 60 },
  L2_MED: { wordLimit: 45, tokenLimit: 120 },
  L2_LONG: { wordLimit: 90, tokenLimit: 220 },

  // L3
  L3_SHORT: { wordLimit: 30, tokenLimit: 90 },
  L3_MED: { wordLimit: 80, tokenLimit: 200 },
  L3_LONG: { wordLimit: 140, tokenLimit: 320 },
} as const satisfies Record<string, LimitSpec>

export function limitLine(l: LimitSpec): string {
  const parts: string[] = []
  if (typeof l.wordLimit === "number") parts.push(`Max ${l.wordLimit} words`)
  if (typeof l.tokenLimit === "number") parts.push(`Max ${l.tokenLimit} tokens`)
  return parts.length ? `(${parts.join(" / ")})` : ""
}

// -----------------------------
// COMPLETENESS — FIELD CHECKLIST
// -----------------------------
// Deterministic completeness = required fields present.
// Keep this synced with your actual card schema.

export const COMPLETENESS_FIELD_CHECKLIST = {
  // -----------------------------
  // L1 — Poster-only
  // -----------------------------
  L1: {
    OVERVIEW: ["KeyArtPoster"],
    CHARACTERS: ["KeyArtPoster"],
    WORLD: ["KeyArtPoster"],
    LORE: ["KeyArtPoster"],
    STYLE: ["KeyArtPoster"],
    STORY: ["KeyArtPoster"],
  },

  // -----------------------------
  // L2 — Development / Bible (generic Character + generic Location)
  // NOTE: L2 is text-first, but includes LIGHT reference images (Lead + Supporting).
  // -----------------------------
  L2: {
    OVERVIEW: [
      "IPTitle",
      "Logline",
      "NarrativeEngine",
      "Tone",
      "MainCharacter",
      "Antagonist",
      "TheWorld",
    ],

    CHARACTERS: {
      Character: {
        RoleType: ["lead|antagonist|supporting|background_recurring"],

        // ✅ L2 images added (light refs)
        Images: ["LeadImage", "SupportingImages"],

        Name: ["Name"],
        Aliases: ["Aliases"],
        StoryFunctionTags: ["StoryFunctionTags"],
        Headline: ["Headline"],
      },
    },

    WORLD: {
      WorldPremiseTone: ["What"],
      AestheticLanguage: ["Keywords"],

      Locations: {
        Location: {
          // ✅ L2 images added (light refs)
          Images: ["LeadImage", "SupportingImages"],

          Name: ["Name"],
          Setting: ["Setting"],
          Position: ["Position"],
          ShortDescription: ["ShortDescription"],

          Meta: ["Scale", "Context", "EnvironmentArchetype", "Function"],
        },
      },
    },

    LORE: {
      LorePremise: ["Text"],
      HistoryTimeline: ["Text"],
      TechMagicPhysicsRules: ["Text"],
      PowerStructuresFactions: ["Text"],
      CultureEverydayLife: ["Text"],
      MythsLegends: ["Text"],
    },

    // IMPORTANT: L2 STYLE does NOT include iconography/camera/lighting (those are L3).
    STYLE: {
      VisualStyle: [
        "LeadImage",
        "SupportingImages",
        "StyleSummary",
        "KeyCharacteristics",
        "StyleElements",
        "ExtractedPatterns",
      ],
      ColorPalette: [
        "MainPaletteStrip",
        "AdditionalSwatches",
        "PaletteSummary",
        "ColorRules",
        "UsageExamples",
        "ExtractedPalette",
      ],
      TextureMaterialLanguage: ["MaterialTileBoard", "MaterialSummary", "SurfaceRules"],
      Composition: [
        "FramingGrid",
        "DepthStacking",
        "FocusSubjectHierarchy",
        "RecurringShapesMotifs",
        "NegativeSpaceRules",
        "ExtractedCompositionPatterns",
      ],
    },

    STORY: {
      CanonTimelineTable: {
        Beat: ["TimeMarker", "EventTitle", "Summary", "KeyCharacters", "LoreLinks"],
      },
      ArcMap: {
        Arc: ["ArcName", "StartState", "ArcQuestionTension", "KeyTurns", "EndState"],
      },
      POVStructureRules: ["POVStrategy", "TimelinePattern", "AccessRules", "NarrativeDevices"],
      CharacterArcsGridLeads: {
        Row: ["Character", "StartState", "MidpointShift", "EndState", "CoreLessonFailure"],
      },
    },
  },

  // -----------------------------
  // L3 — Production cards
  // -----------------------------
  L3: {
    CHARACTERS: {
      Character: {
        RoleType: ["lead|antagonist|supporting|background_recurring"],
        Gen: ["Trigger", "Tags", "NegativeTags", "Notes"],
        IdentityRole: ["NameLabel", "AliasesNicknames", "StoryFunctionTag", "Status"],
        HeadlineBox: ["Headline"],
        SummaryBox: ["ProfileText"],
        Visual: [
          "AgeRange",
          "BodyType",
          "KeyFacialPhysicalTraits",
          "Hairstyle",
          "ClothingStyle",
          "KeyPropsSilhouetteHook",
        ],
        Images: [
          "LeadImage",
          "SecondaryImages",
          "PoseSheet",
          "ClothesImgs",
          "PropImgs",
          "DetailImgs",
        ],
        Voice: [
          "BaselineVoice",
          "SyntaxTempo",
          "Register",
          "SlangDialect",
          "SignaturePhrasesVerbalTics",
          "AudioSample",
        ],
        BehaviourRules: [
          "CoreMotivations",
          "CoreFearsVulnerabilities",
          "AlwaysRules",
          "NeverRules",
          "PrimaryFlaws",
          "DecisionPatterns",
        ],
        Relationships: {
          Link: ["TargetRef", "Type", "Directionality", "TensionLevel", "KeyTurningPoints", "Notes"],
        },
      },
    },

    WORLD: {
      Locations: {
        Location: {
          Meta: ["Scale", "Context", "EnvironmentArchetype", "Function"],
          Gen: ["Trigger", "Tags", "NegativeTags", "Notes"],
          Images: ["LeadImage", "Map", "SecondaryImages"],
          Name: ["NameLabel"],
          SummaryBox: ["Summary"],
          Relationships: {
            Link: ["TargetRef", "Type", "Directionality", "TensionLevel", "Notes"],
          },
        },
      },
    },

    LORE: {
      Timeline: ["Timeline"],
      Factions: {
        Faction: {
          SummaryBox: ["ProfileText"],
          Images: ["Symbol", "Headquarters", "SecondaryImages", "TypeImages", "PropImages"],
          IngredientChecklist: ["IdentityMyth", "PowerMethods", "PromisePrice", "FractureLine"],
          Relationships: {
            Link: ["TargetRef", "Type", "Directionality", "TensionLevel", "KeyTurningPoints", "Notes"],
          },
        },
      },
    },

    // L3 STYLE only (as specified)
    STYLE: {
      VisualIconography: [
        "IconographyOutline",
        "AdditionalMotifs",
        "IconSummary",
        "MotifList",
        "MetaSymbolsMeaning",
        "ShapeLanguage",
        "ExtractedMotifs",
      ],
      CameraAngle: [
        "DefaultShotLanguage",
        "NamedAngles",
        "MovementTendencies",
        "CharacterPOVRules",
        "ExtractedCameraPatterns",
      ],
      Lighting: [
        "BaseLightingMood",
        "ContrastShadowRules",
        "LightSourceLogic",
        "ColorTemperatureMap",
        "TimeOfDayBias",
        "AccentLightingPatterns",
        "ExtractedLightingPatterns",
      ],
    },

    // ✅ L3 STORY expanded as structured production subfields
    STORY: {
      OverallIPNarrative: ["Text"],

      MasterTimeline: {
        Beat: [
          "TimeMarker",
          "EventTitle",
          "Summary",
          "KeyCharacters",
          "Locations",
          "Factions",
          "Dependencies",
        ],
      },

      FormatNarrative: [
        "FormatType",
        "EpisodeCountOrLength",
        "RuntimeOrPageCount",
        "ReleaseCadence",
        "StructureRules",
      ],

      EpisodePack: {
        Episode: [
          "EpisodeId",
          "EpisodeNumber",
          "Title",
          "Logline",
          "BeatSheet",
          "KeyCharacters",
          "KeyLocations",
          "LoreDependencies",
          "AssetNeeds",
          "Notes",
        ],
      },
    },
  },
} as const satisfies Record<Level, Record<string, ChecklistLeaf | ChecklistNode>>

// -----------------------------
// Flatten helper
// -----------------------------

export function flattenChecklist(node: ChecklistNode, prefix = ""): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(node)) {
    const next = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) {
      for (const field of v) out.push(`${next}.${field}`)
    } else {
      out.push(...flattenChecklist(v as ChecklistNode, next))
    }
  }
  return out
}

// =====================================
// PRECEDENCE + PROMPT ASSEMBLY ORDER
// =====================================

export const PROMPT_PRECEDENCE = `
PRECEDENCE (when rules disagree):
1) Hard Canon (Living Bible) facts/constraints (highest authority).
2) This file's schema + checklist keys (field names + allowed structure).
3) Level rules (L1/L2/L3) for what belongs where.
4) Domain rules (OVERVIEW/CHARACTERS/WORLD/LORE/STYLE/STORY) for focus.
5) Field/subfield rules + limits (word/token caps).
6) If still ambiguous: output Unknown (or []), and avoid inventing canon.
`.trim()

export const PROMPT_ASSEMBLY_ORDER = `
PROMPT ASSEMBLY ORDER (system -> task):
A) CORE_OTHERLY_EXEC (role + canon discipline + hard canon injected)
B) RULE_GLOBAL_OUTPUT + RULE_CANON_DISCIPLINE
C) PROMPT_PRECEDENCE
D) Level base rules for the target level
E) Domain rules for the target level+domain (e.g., L1 cover prompt, keyposter)
F) Field rules for the target item/section (e.g., L2 overview fields, L3 story subfields)
G) Limits reminder (word/token caps)
H) Output format reminder (JSON only)
`.trim()

// =====================================
// GLOBAL OUTPUT RULES
// =====================================

export const RULE_GLOBAL_OUTPUT = `
GLOBAL OUTPUT RULES:
- Output JSON only (no markdown, no prose outside JSON).
- Use exact field names from the checklist/schema.
- Do not rename keys. Do not add new top-level keys.
- If a field is missing in source: use "Unknown" (string) or [] (empty array) depending on expected type.
- Keep names consistent across levels (no drift).
`.trim()

export const RULE_CANON_DISCIPLINE = `
CANON DISCIPLINE:
- Never introduce new facts not supported by provided material or previously approved canon.
- Prefer stable phrasing over poetic language.
- Avoid contradictions; if conflict exists, surface as Unknown.
`.trim()

// =====================================
// L1 — COVER PROMPT + KEYPOSTER
// =====================================

export const RULE_L1_COVER_PROMPT_BY_DOMAIN = {
  OVERVIEW: `
IP COVER PROMPT — OVERVIEW ${limitLine(LIMITS.L1_COVER_PROMPT)}
AI Instruction: From OVERVIEW, write a visual prompt that conveys premise + tone + main conflict as a single readable image idea.
`.trim(),

  CHARACTERS: `
IP COVER PROMPT — CAST ${limitLine(LIMITS.L1_COVER_PROMPT)}
AI Instruction: From CHARACTERS, write a cover prompt foregrounding lead/antagonist identity and ensemble vibe.
`.trim(),

  WORLD: `
IP COVER PROMPT — WORLD ${limitLine(LIMITS.L1_COVER_PROMPT)}
AI Instruction: From WORLD, write a cover prompt emphasising signature location/environment and scale.
`.trim(),

  LORE: `
IP COVER PROMPT — LORE ${limitLine(LIMITS.L1_COVER_PROMPT)}
AI Instruction: From LORE, write a cover prompt symbolising the core system/rule/myth (emblematic, not plot moments).
`.trim(),

  STYLE: `
IP COVER PROMPT — STYLE ${limitLine(LIMITS.L1_COVER_PROMPT)}
AI Instruction: From STYLE (palette/materials/composition), write a cover prompt specifying look/feel only (no story facts).
`.trim(),

  STORY: `
IP COVER PROMPT — STORY ${limitLine(LIMITS.L1_COVER_PROMPT)}
AI Instruction: From STORY, write a cover prompt communicating genre cues + stakes + arc tension (avoid spoilers).
`.trim(),
} as const satisfies Record<Domain, string>

export const RULE_L1_KEYPOSTER_BASE = `
L1 KEYPOSTER (base):
- Prefer extract/select from uploaded material.
- If missing: generate via AI using the section’s COVER PROMPT.
- Output exactly 1 image.
`.trim()

export const RULE_L1_KEYPOSTER_BY_DOMAIN = {
  OVERVIEW: `
L1 KEYPOSTER / OVERVIEW:
- Focus: the IP as a whole (premise + tone + main conflict).
- Prompt source: IP COVER PROMPT (overall identity).
`.trim(),

  CHARACTERS: `
L1 KEYPOSTER / CHARACTERS:
- Focus: cast identity (lead + antagonist + ensemble vibe).
- Prompt source: CAST COVER PROMPT.
- Avoid: world-building scenery unless it supports the cast.
`.trim(),

  WORLD: `
L1 KEYPOSTER / WORLD:
- Focus: world/geography/signature location.
- Prompt source: WORLD COVER PROMPT.
- Avoid: character close-ups unless they serve the location.
`.trim(),

  LORE: `
L1 KEYPOSTER / LORE:
- Focus: rules/myth/system (symbols, artifacts, factions, core logic).
- Prompt source: LORE COVER PROMPT.
- Avoid: literal plot moments; keep it emblematic.
`.trim(),

  STYLE: `
L1 KEYPOSTER / STYLE:
- Focus: visual language (palette, materials, composition).
- Prompt source: STYLE COVER PROMPT.
- Avoid: adding new story facts; it’s about look/feel.
`.trim(),

  STORY: `
L1 KEYPOSTER / STORY:
- Focus: narrative motion (genre cues, stakes, arc tension).
- Prompt source: STORY COVER PROMPT.
- Avoid: spoilers; prefer archetypal moments.
`.trim(),
} as const satisfies Record<Domain, string>

export function getRuleL1KeyPoster(domain: Domain): string {
  return `${RULE_L1_KEYPOSTER_BASE}\n\n${RULE_L1_KEYPOSTER_BY_DOMAIN[domain]}`
}

// =====================================
// L2 — OVERVIEW TEXT RULES (limits)
// =====================================

export type L2OverviewField =
  | "IPTitle"
  | "Logline"
  | "NarrativeEngine"
  | "Tone"
  | "MainCharacter"
  | "Antagonist"
  | "TheWorld"

export const RULES_L2_OVERVIEW_FIELDS: Record<
  L2OverviewField,
  { rule: string; limit: LimitSpec }
> = {
  IPTitle: { rule: "Short; memorable; genre-fit; no spoilers.", limit: LIMITS.L2_TINY },
  Logline: { rule: "Hero + goal + opposition + stakes + hook.", limit: LIMITS.L2_MED },
  NarrativeEngine: { rule: "Repeatable conflict loop + escalation rule + what sustains it.", limit: LIMITS.L2_MED },
  Tone: { rule: "Plain words; consistent; 2–3 comps max; no mixed signals.", limit: LIMITS.L2_SHORT },
  MainCharacter: { rule: "Macro only: role + contradiction + drive/need/ghost.", limit: LIMITS.L2_LONG },
  Antagonist: { rule: "Macro only: motivation + method + escalation; pressure on hero.", limit: LIMITS.L2_LONG },
  TheWorld: { rule: "Macro only: vibe + logic; what’s normal; what’s impossible.", limit: LIMITS.L2_MED },
} as const

// =====================================
// L2 — CHARACTERS (generic) + images (light refs)
// =====================================

export const RULE_L2_CHARACTERS_CARD = `
L2 CHARACTERS — Character (generic)
Required fields:
- RoleType
- Images: LeadImage + SupportingImages
- Name, Aliases, StoryFunctionTags, Headline
Limits:
- Headline ${limitLine(LIMITS.L2_SHORT)}
AI Instruction:
- Macro only. No production triggers/tags.
- Images are reference-level (extract if possible; otherwise leave Unknown / []).
`.trim()

// =====================================
// L2 — WORLD/LOCATIONS (generic) + images (light refs)
// =====================================

export const RULE_L2_LOCATIONS_CARD = `
L2 WORLD — Locations / Location (generic)
Required fields:
- Images: LeadImage + SupportingImages
- Name, Setting, Position, ShortDescription
- Meta: Scale, Context, EnvironmentArchetype, Function
Limits:
- ShortDescription ${limitLine(LIMITS.L2_MED)}
AI Instruction:
- Macro, scene-usable. No production triggers/tags.
- Images are reference-level (extract if possible; otherwise Unknown / []).
`.trim()

// =====================================
// L2 — LORE RULES (limits)
// =====================================

export type L2LoreBox =
  | "LorePremise"
  | "HistoryTimeline"
  | "TechMagicPhysicsRules"
  | "PowerStructuresFactions"
  | "CultureEverydayLife"
  | "MythsLegends"

export const RULES_L2_LORE_BOXES: Record<
  L2LoreBox,
  {
    limit: LimitSpec
    aiInstruction: string
    ingredientChecklist: readonly string[]
    hasImageSlot?: boolean
    optional?: boolean
  }
> = {
  LorePremise: {
    limit: LIMITS.L2_LONG,
    aiInstruction:
      "Core premise: what is different + how it shapes life + built-in conflict.",
    ingredientChecklist: ["Core Twist", "Everyday Impact", "Built-in Conflict"],
  },

  HistoryTimeline: {
    limit: LIMITS.L2_LONG,
    aiInstruction:
      "Key history beats that still shape the present (not encyclopedic).",
    ingredientChecklist: ["Spine (2–4 beats)", "Break Point", "Present Tension"],
  },

  TechMagicPhysicsRules: {
    limit: LIMITS.L2_LONG,
    aiInstruction:
      "Explain the system with constraints/costs; keep it concrete and story-usable.",
    ingredientChecklist: ["Baseline", "Edge", "Rules & Costs", "Story Hook"],
    hasImageSlot: true,
  },

  PowerStructuresFactions: {
    limit: LIMITS.L2_LONG,
    aiInstruction:
      "Who holds power, who opposes, how power is enforced, where it cracks.",
    ingredientChecklist: ["Rulers", "Opposition", "Mechanism", "Fault Line"],
    hasImageSlot: true,
  },

  CultureEverydayLife: {
    limit: LIMITS.L2_LONG,
    aiInstruction:
      "How it feels to live here: norms, taboos, daily texture, frictions.",
    ingredientChecklist: ["Values & Taboos", "Daily Texture", "Social Friction"],
    hasImageSlot: true,
  },

  MythsLegends: {
    limit: LIMITS.L2_LONG,
    aiInstruction:
      "Main myths/legends; unreliable but emotionally revealing.",
    ingredientChecklist: ["Big Myth", "Variants", "Emotional Truth"],
    hasImageSlot: true,
    optional: true,
  },
} as const

// =====================================
// L2 — STYLE RULES (ONLY L2 sections)
// =====================================

export type L2StyleSection =
  | "VisualStyle"
  | "ColorPalette"
  | "TextureMaterialLanguage"
  | "Composition"

export const RULES_L2_STYLE_SECTIONS: Record<
  L2StyleSection,
  { limit: LimitSpec; aiInstruction: string }
> = {
  VisualStyle: {
    limit: LIMITS.L2_LONG,
    aiInstruction: "Describe visual worldview only (mood + look). No story facts.",
  },
  ColorPalette: {
    limit: LIMITS.L2_LONG,
    aiInstruction: "Define palette + usage rules. Practical guidance, not vibes.",
  },
  TextureMaterialLanguage: {
    limit: LIMITS.L2_MED,
    aiInstruction: "Define material identity + surface rules across the world.",
  },
  Composition: {
    limit: LIMITS.L2_LONG,
    aiInstruction: "Define framing grammar: balance, hierarchy, negative space.",
  },
} as const

// =====================================
// L2 — STORY RULES (board)
// =====================================

export type L2StorySection =
  | "CanonTimelineTable"
  | "ArcMap"
  | "POVStructureRules"
  | "CharacterArcsGridLeads"

export const RULES_L2_STORY_SECTIONS: Record<
  L2StorySection,
  { limit?: LimitSpec; aiInstruction: string }
> = {
  CanonTimelineTable: {
    aiInstruction:
      "Beats in in-universe chronological order. Each Summary concise and concrete. No episode numbering.",
  },
  ArcMap: {
    aiInstruction:
      "3–6 arcs. Each arc describes what changes and key turns (2–3).",
  },
  POVStructureRules: {
    limit: LIMITS.L2_MED,
    aiInstruction:
      "Define POV strategy, timeline pattern, audience access rules, narrative devices.",
  },
  CharacterArcsGridLeads: {
    aiInstruction:
      "Track internal change for leads. Keep each row concise and consistent.",
  },
} as const

// =====================================
// L3 — STORY RULES (expanded constraints per subfield)
// =====================================

export type L3StorySection =
  | "OverallIPNarrative"
  | "MasterTimeline"
  | "FormatNarrative"
  | "EpisodePack"

export const RULE_L3_STORY_BASE = `
L3 STORY (production)
- Everything must be structured and referencable (characters/locations/factions).
- Dependencies must be explicit and refer to earlier timeline items or established deliverables.
- Avoid ambiguity: name things consistently; avoid synonyms that drift.
`.trim()

export const RULES_L3_STORY_SECTIONS: Record<
  L3StorySection,
  {
    limit?: LimitSpec
    constraints: readonly string[]
    targetOutput: string
    aiInstruction: string
  }
> = {
  OverallIPNarrative: {
    limit: LIMITS.L3_LONG,
    constraints: [
      "No marketing tone.",
      "No spoilers beyond what is already in provided material/canon.",
      "Must align with L2 Overview (NarrativeEngine/Tone) and not contradict it.",
    ],
    targetOutput: `OverallIPNarrative.Text ${limitLine(LIMITS.L3_LONG)}`,
    aiInstruction:
      "Write a production-clear narrative overview: premise + engine + arc shape + constraints writers must respect.",
  },

  MasterTimeline: {
    constraints: [
      "Beat count target: 25–60 beats (avoid micro-beat explosion).",
      `Each Beat.Summary ${limitLine(LIMITS.L3_SHORT)} (keep it dependency-friendly).`,
      "KeyCharacters/Locations/Factions must be canonical labels/IDs (no new names).",
      "Dependencies must be a list of strings referencing earlier Beat.EventTitle (or approved dependency naming).",
    ],
    targetOutput:
      "MasterTimeline.Beat[] with fields: TimeMarker, EventTitle, Summary, KeyCharacters, Locations, Factions, Dependencies",
    aiInstruction:
      "Create a master timeline usable for production planning: clean event titles, concise summaries, explicit dependencies.",
  },

  FormatNarrative: {
    constraints: [
      "FormatType must be one of: film | series | podcast | webtoon | novel | game | other.",
      "EpisodeCountOrLength must be explicit (e.g., '8 episodes' or 'feature-length').",
      "StructureRules should be bullet-style inside the string (not paragraphs).",
      `StructureRules ${limitLine(LIMITS.L3_MED)}`,
    ],
    targetOutput:
      "FormatNarrative fields: FormatType, EpisodeCountOrLength, RuntimeOrPageCount, ReleaseCadence, StructureRules",
    aiInstruction:
      "Define the production format and structural rules (act breaks, cliffhangers, A/B plots, cold opens, POV constraints).",
  },

  EpisodePack: {
    constraints: [
      "Episode count must match FormatNarrative (or be Unknown if not decided).",
      `Episode.Logline ${limitLine(LIMITS.L2_MED)}`,
      "BeatSheet should be a concise list (recommended 8–14 beats) inside the field (array or newline bullets).",
      "AssetNeeds must be explicit: list what must be produced (characters, locations, props, shots, audio, VFX) as bullet strings.",
      "LoreDependencies must reference existing LORE/Faction/System items, not invent new lore.",
    ],
    targetOutput:
      "EpisodePack.Episode[] with fields: EpisodeId, EpisodeNumber, Title, Logline, BeatSheet, KeyCharacters, KeyLocations, LoreDependencies, AssetNeeds, Notes",
    aiInstruction:
      "Write episodes as production units: clear logline, beat sheet, explicit dependencies, explicit asset needs.",
  },
} as const

// =====================================
// Optional: simple prompt builder (assembly order)
// =====================================

export function buildPromptBundle(args: {
  level: Level
  domain: Domain
  purpose: string // e.g., "Generate L2 Overview", "Fill L3 EpisodePack", etc.
  extra?: string
}): string {
  const { level, domain, purpose, extra } = args

  const parts: string[] = []
  parts.push(RULE_GLOBAL_OUTPUT)
  parts.push(RULE_CANON_DISCIPLINE)
  parts.push(PROMPT_PRECEDENCE)
  parts.push(`TASK: ${purpose}`)
  parts.push(`TARGET: ${level} / ${domain}`)

  if (level === "L1") {
    parts.push(RULE_L1_COVER_PROMPT_BY_DOMAIN[domain])
    parts.push(getRuleL1KeyPoster(domain))
  }

  if (level === "L2" && domain === "OVERVIEW") {
    parts.push("L2 OVERVIEW — field rules:")
    ;(Object.keys(RULES_L2_OVERVIEW_FIELDS) as L2OverviewField[]).forEach((k) => {
      const v = RULES_L2_OVERVIEW_FIELDS[k]
      parts.push(`- ${k} ${limitLine(v.limit)}: ${v.rule}`)
    })
  }

  if (level === "L2" && domain === "CHARACTERS") parts.push(RULE_L2_CHARACTERS_CARD)
  if (level === "L2" && domain === "WORLD") parts.push(RULE_L2_LOCATIONS_CARD)

  if (level === "L3" && domain === "STORY") {
    parts.push(RULE_L3_STORY_BASE)
    ;(Object.keys(RULES_L3_STORY_SECTIONS) as L3StorySection[]).forEach((k) => {
      const v = RULES_L3_STORY_SECTIONS[k]
      const lim = v.limit ? ` ${limitLine(v.limit)}` : ""
      parts.push(`\nL3 STORY — ${k}${lim}`)
      v.constraints.forEach((c) => parts.push(`- ${c}`))
      parts.push(`Target Output: ${v.targetOutput}`)
      parts.push(`AI Instruction: ${v.aiInstruction}`)
    })
  }

  if (extra) parts.push(`\nEXTRA:\n${extra}`)

  return parts.join("\n\n")
}

// -----------------------------------------------------------------------------
// Backwards-compat exports (required by existing app code)
// -----------------------------------------------------------------------------

/**
 * Flatten ONLY the "static" checklist paths.
 * Skip templates that are instantiated later (Character / Location).
 */
export function getStaticChecklist(
  node: ChecklistNode | ChecklistLeaf,
  prefix = ""
): string[] {
  const out: string[] = []

  if (Array.isArray(node)) {
    for (const field of node) out.push(`${prefix}.${field}`)
    return out
  }

  for (const [k, v] of Object.entries(node)) {
    // templates that are instantiated later into named cards
    if (k === "Character" || k === "Location") continue

    const next = prefix ? `${prefix}.${k}` : k

    if (Array.isArray(v)) {
      for (const field of v) out.push(`${next}.${field}`)
    } else {
      out.push(...getStaticChecklist(v as ChecklistNode, next))
    }
  }

  return out
}

/**
 * JSON-serializable "rules object" for the Settings panel.
 * (No functions; UI can display text/rules based on this.)
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
} as const

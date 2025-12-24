import type { ChecklistLeaf, ChecklistNode } from "./rules.ts";
import { COMPLETENESS_FIELD_CHECKLIST } from "./rules.ts";
import type { Level, Domain, IdentifiedEntities } from "../types.ts";

/**
 * Centralized “is this field an image?” logic.
 * - Structural rule: anything under `.Images.*` is an image field.
 * - Explicit leaf names for non-Images sections (Style palette strips, boards, etc.)
 */
const IMAGE_LEAF_NAMES = new Set<string>([
  // L1
  "KeyArtPoster",

  // Common image leaves (when not under Images.*)
  "LeadImage",
  "SupportingImages",
  "SecondaryImages",
  "PoseSheet",
  "ClothesImgs",
  "PropImgs",
  "DetailImgs",

  // L2 STYLE (explicit)
  "MainPaletteStrip",
  "AdditionalSwatches",
  "MaterialTileBoard",
  "FramingGrid",

  // L3 STYLE (explicit)
  "IconographyOutline",
  "AdditionalMotifs",
]);

export function isImagePath(path: string): boolean {
  const parts = path.split(".");
  if (parts.includes("Images")) return true;

  const leaf = parts[parts.length - 1] ?? "";
  return IMAGE_LEAF_NAMES.has(leaf);
}

/**
 * We only store plain objects/arrays in the checklist, so JSON clone is safe here.
 */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * Instantiate a domain checklist from the schema template + identified entities.
 *
 * - L1: return as-is (poster-only).
 * - L2 CHARACTERS: { "Orin": <CharacterTemplate>, "Lena": <CharacterTemplate>, ... }
 * - L2 WORLD: keep World fields, but replace Locations.Location template with:
 *      Locations: { "The Cliffs": <LocationTemplate>, ... }
 * - L3 CHARACTERS / L3 WORLD: same idea.
 */
export function getDomainChecklist(
  level: Level,
  domain: Domain,
  entities: IdentifiedEntities
): ChecklistNode | ChecklistLeaf {
  const domainTemplate =
    (COMPLETENESS_FIELD_CHECKLIST as any)?.[level]?.[domain] as ChecklistNode | ChecklistLeaf;

  if (!domainTemplate) return [] as any;

  // L1 never instantiates (poster only)
  if (level === "L1") return domainTemplate;

  // L2 CHARACTERS => instantiate Character template to each character name
  if (level === "L2" && domain === "CHARACTERS") {
    const t = clone(domainTemplate) as any;
    const charTemplate = t?.Character;
    if (!charTemplate || !entities?.characters?.length) return domainTemplate;

    const out: Record<string, any> = {};
    for (const name of entities.characters) out[name] = charTemplate;
    return out as any;
  }

  // L3 CHARACTERS => same
  if (level === "L3" && domain === "CHARACTERS") {
    const t = clone(domainTemplate) as any;
    const charTemplate = t?.Character;
    if (!charTemplate || !entities?.characters?.length) return domainTemplate;

    const out: Record<string, any> = {};
    for (const name of entities.characters) out[name] = charTemplate;
    return out as any;
  }

  // L2 WORLD => instantiate Locations.Location
  if (level === "L2" && domain === "WORLD") {
    const t = clone(domainTemplate) as any;

    const locTemplate = t?.Locations?.Location;
    if (!locTemplate || !entities?.locations?.length) return domainTemplate;

    // Replace Locations.Location with Locations.<Name>
    const locs: Record<string, any> = {};
    for (const name of entities.locations) locs[name] = locTemplate;

    t.Locations = locs;
    return t as any;
  }

  // L3 WORLD => instantiate Locations.Location
  if (level === "L3" && domain === "WORLD") {
    const t = clone(domainTemplate) as any;

    const locTemplate = t?.Locations?.Location;
    if (!locTemplate || !entities?.locations?.length) return domainTemplate;

    const locs: Record<string, any> = {};
    for (const name of entities.locations) locs[name] = locTemplate;

    t.Locations = locs;
    return t as any;
  }

  // Default: no instantiation
  return domainTemplate;
}

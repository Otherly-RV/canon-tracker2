type PageImage = { page: number; imageUrl?: string; url?: string };

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function getUrl(p: PageImage): string {
  return (p.imageUrl || p.url || "").trim();
}

function extractEntityName(path: string): { kind: "character" | "location" | "none"; name: string } {
  const parts = path.split(".");

  const iChar = parts.indexOf("CHARACTERS");
  if (iChar >= 0 && parts[iChar + 1]) {
    return { kind: "character", name: parts[iChar + 1] };
  }

  const iLoc = parts.indexOf("Locations");
  if (iLoc >= 0 && parts[iLoc + 1]) {
    return { kind: "location", name: parts[iLoc + 1] };
  }

  return { kind: "none", name: "" };
}

function domainIndexForL1(path: string): number {
  // L1.<DOMAIN>.KeyArtPoster
  if (path.includes(".OVERVIEW.")) return 0;
  if (path.includes(".CHARACTERS.")) return 1;
  if (path.includes(".WORLD.")) return 2;
  if (path.includes(".LORE.")) return 3;
  if (path.includes(".STYLE.")) return 4;
  if (path.includes(".STORY.")) return 5;
  return 0;
}

/**
 * Deterministic best-guess:
 * - L1 KeyArtPoster: different page per domain (0..5)
 * - Character/Location images: hash(name + leaf) % pages
 * - otherwise: page 0
 */
export function pickBestPageImageUrl(path: string, pages: PageImage[]): string {
  const usable = pages.map(getUrl).filter(Boolean);
  if (!usable.length) return "";

  // L1 KeyArtPoster varies by domain
  if (path.endsWith(".KeyArtPoster")) {
    const idx = domainIndexForL1(path) % usable.length;
    return usable[idx];
  }

  // entity-based slots vary by entity name + leaf name
  const entity = extractEntityName(path);
  if (entity.kind !== "none") {
    const leaf = path.split(".").pop() || "";
    const salt = `${entity.kind}:${entity.name}:${leaf}`;
    const idx = hashString(salt) % usable.length;
    return usable[idx];
  }

  // Style “image-like” leaves: spread by leaf
  const leaf = path.split(".").pop() || "";
  const idx = hashString(`leaf:${leaf}`) % usable.length;
  return usable[idx];
}

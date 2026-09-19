const METRO_BUCKETS: Record<string, readonly string[]> = {
  nyc: [
    "brooklyn",
    "manhattan",
    "queens",
    "bronx",
    "staten island",
    "new york",
    "nyc",
  ],
  la: ["los angeles", "la", "santa monica", "pasadena", "burbank"],
  sf: ["san francisco", "sf", "oakland", "berkeley", "san jose"],
  chi: ["chicago", "evanston", "oak park"],
};

export function normalizeLocation(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesAlias(value: string, alias: string): boolean {
  if (value === alias) return true;
  // Short tokens like "la" or "sf" must match exactly to avoid false positives.
  if (alias.length <= 3) return false;
  return value.includes(alias);
}

function metroKey(value: string): string | null {
  for (const [key, aliases] of Object.entries(METRO_BUCKETS)) {
    if (aliases.some((alias) => matchesAlias(value, alias))) return key;
  }
  return null;
}

function stateToken(value: string): string {
  const parts = value.split(",").map((part) => part.trim());
  const last = parts[parts.length - 1] ?? value;
  if (last.length === 2 && /^[a-z]{2}$/.test(last)) return last;
  return parts.length > 1 ? last : "";
}

/** Prototype distance tiers without geocoding. */
export function locationWithinRadius(
  left: string,
  right: string,
  radiusMiles: number,
): boolean {
  const a = normalizeLocation(left);
  const b = normalizeLocation(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (radiusMiles >= 100) return true;

  const metroA = metroKey(a);
  const metroB = metroKey(b);
  if (metroA && metroB && metroA === metroB && radiusMiles >= 25) return true;

  const stateA = stateToken(a);
  const stateB = stateToken(b);
  if (stateA && stateB && stateA === stateB && radiusMiles >= 50) return true;

  return false;
}

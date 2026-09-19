import { City } from "country-state-city";

type LocationProfile = {
  town: string;
  countryCode?: string | null;
  stateCode?: string | null;
};

type Coordinates = { latitude: number; longitude: number };
const cityCache = new Map<string, Map<string, Coordinates>>();

function cityCoordinates(profile: LocationProfile): Coordinates | null {
  const countryCode = profile.countryCode?.trim();
  const stateCode = profile.stateCode?.trim();
  const town = normalizeLocation(profile.town);
  if (!countryCode || !stateCode || !town) return null;
  const key = `${countryCode}:${stateCode}`;
  let cities = cityCache.get(key);
  if (!cities) {
    cities = new Map(
      City.getCitiesOfState(countryCode, stateCode).map((city) => [
        normalizeLocation(city.name),
        {
          latitude: Number(city.latitude),
          longitude: Number(city.longitude),
        },
      ]),
    );
    cityCache.set(key, cities);
  }
  return cities.get(town) ?? null;
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function locationDistanceMiles(
  left: LocationProfile,
  right: LocationProfile,
): number | null {
  const leftCoordinates = cityCoordinates(left);
  const rightCoordinates = cityCoordinates(right);
  if (!leftCoordinates || !rightCoordinates) {
    return normalizeLocation(left.town) === normalizeLocation(right.town)
      ? 0
      : null;
  }
  const latitudeDelta = radians(
    rightCoordinates.latitude - leftCoordinates.latitude,
  );
  const longitudeDelta = radians(
    rightCoordinates.longitude - leftCoordinates.longitude,
  );
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(leftCoordinates.latitude)) *
      Math.cos(radians(rightCoordinates.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

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

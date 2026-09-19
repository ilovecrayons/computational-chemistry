import { City, Country, State } from "country-state-city";
import { jsonError, requireUser } from "../../../lib/api";

const allowedCountries: Record<string, true> = {
  US: true,
  CA: true,
  GB: true,
  AU: true,
};
const MAX_REVERSE_DISTANCE_MILES = 100;
type ReverseLocation = {
  town: string;
  state: string;
  stateCode: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
};
let reverseLocations: ReverseLocation[] | null = null;

function supportedReverseLocations(): ReverseLocation[] {
  if (reverseLocations) return reverseLocations;
  reverseLocations = City.getAllCities()
    .filter((city) => allowedCountries[city.countryCode] === true)
    .map((city) => {
      const latitude = Number(city.latitude);
      const longitude = Number(city.longitude);
      const country = Country.getCountryByCode(city.countryCode);
      const state = State.getStateByCodeAndCountry(
        city.stateCode,
        city.countryCode,
      );
      if (
        !city.name ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !country ||
        !state
      )
        return null;
      return {
        town: city.name,
        state: state.name,
        stateCode: state.isoCode,
        country: country.name,
        countryCode: country.isoCode,
        latitude,
        longitude,
      };
    })
    .filter((location): location is ReverseLocation => location !== null);
  return reverseLocations;
}

function distanceMiles(
  leftLatitude: number,
  leftLongitude: number,
  rightLatitude: number,
  rightLongitude: number,
): number {
  const latitudeDelta = ((rightLatitude - leftLatitude) * Math.PI) / 180;
  const longitudeDelta = ((rightLongitude - leftLongitude) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos((leftLatitude * Math.PI) / 180) *
      Math.cos((rightLatitude * Math.PI) / 180) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function reverseGeolocation(latitude: number, longitude: number) {
  let nearest: ReverseLocation | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const location of supportedReverseLocations()) {
    const distance = distanceMiles(
      latitude,
      longitude,
      location.latitude,
      location.longitude,
    );
    if (distance < nearestDistance) {
      nearest = location;
      nearestDistance = distance;
    }
  }
  if (!nearest || nearestDistance > MAX_REVERSE_DISTANCE_MILES) return null;
  const { latitude: _latitude, longitude: _longitude, ...broadLocation } =
    nearest;
  return broadLocation;
}

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = (await request.json().catch(() => null)) as {
      latitude?: unknown;
      longitude?: unknown;
    } | null;
    const latitude =
      typeof body?.latitude === "number" &&
      Number.isFinite(body.latitude) &&
      body.latitude >= -90 &&
      body.latitude <= 90
        ? body.latitude
        : null;
    const longitude =
      typeof body?.longitude === "number" &&
      Number.isFinite(body.longitude) &&
      body.longitude >= -180 &&
      body.longitude <= 180
        ? body.longitude
        : null;
    if (latitude === null || longitude === null)
      return Response.json(
        {
          error: {
            code: "INVALID_LOCATION",
            message: "Send a valid location to choose a nearby town.",
          },
        },
        { status: 400 },
      );
    const location = reverseGeolocation(latitude, longitude);
    if (!location)
      return Response.json(
        {
          error: {
            code: "LOCATION_NOT_SUPPORTED",
            message:
              "We could not find a supported town nearby. Choose your location manually.",
          },
        },
        { status: 422 },
      );
    return Response.json(location);
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const level = query.get("level") || "country";
  if (level === "country")
    return Response.json(
      Country.getAllCountries()
        .filter((country) => allowedCountries[country.isoCode] === true)
        .map((country) => ({ code: country.isoCode, name: country.name })),
    );
  const countryCode = query.get("country") || "";
  if (allowedCountries[countryCode] !== true)
    return Response.json({ error: "Choose a supported country." }, { status: 400 });
  if (level === "state")
    return Response.json(
      State.getStatesOfCountry(countryCode).map((state) => ({
        code: state.isoCode,
        name: state.name,
      })),
    );
  if (level === "city") {
    const stateCode = query.get("state") || "";
    const search = (query.get("q") || "").trim().toLocaleLowerCase();
    return Response.json(
      City.getCitiesOfState(countryCode, stateCode)
        .filter((city) => !search || city.name.toLocaleLowerCase().includes(search))
        .slice(0, 100)
        .map((city) => ({ name: city.name })),
    );
  }
  return Response.json({ error: "Unknown location level." }, { status: 400 });
}

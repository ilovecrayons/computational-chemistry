import { City, Country, State } from "country-state-city";

const allowedCountries = new Set(["US", "CA", "GB", "AU"]);

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const level = query.get("level") || "country";
  if (level === "country")
    return Response.json(
      Country.getAllCountries()
        .filter((country) => allowedCountries.has(country.isoCode))
        .map((country) => ({ code: country.isoCode, name: country.name })),
    );
  const countryCode = query.get("country") || "";
  if (!allowedCountries.has(countryCode))
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

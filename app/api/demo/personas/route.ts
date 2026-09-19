import { DEMO_PASSWORD, demoPersonas } from "../../../../db/seed";
import { ApiFailure, jsonError } from "../../../../lib/api";
import { config } from "../../../../lib/config";

export const runtime = "nodejs";
export async function GET() {
  try {
    if (!config.demoMode)
      throw new ApiFailure(404, "NOT_FOUND", "Demo personas are not enabled.");
    return Response.json(
      {
        personas: demoPersonas.map(({ id, name, email }) => ({
          id,
          name,
          email,
        })),
        password: DEMO_PASSWORD,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

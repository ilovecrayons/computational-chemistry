import { getMatches } from "../../../features/matches/matches";
import { jsonError, requireUser } from "../../../lib/api";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ matches: getMatches(user.id) });
  } catch (error) {
    return jsonError(error);
  }
}

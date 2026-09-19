import { safetyAction, safetyInput } from "../../../features/matches/matches";
import { jsonError, parseBody, requireUser } from "../../../lib/api";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(
      safetyAction(user.id, await parseBody(request, safetyInput)),
    );
  } catch (error) {
    return jsonError(error);
  }
}

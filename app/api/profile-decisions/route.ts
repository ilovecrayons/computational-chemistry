import {
  decideProfile,
  decisionInput,
} from "../../../features/matches/matches";
import { jsonError, parseBody, requireUser } from "../../../lib/api";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const value = await parseBody(request, decisionInput);
    return Response.json(
      decideProfile(
        user.id,
        value.targetId,
        value.decision,
        value.openerMemeId,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}

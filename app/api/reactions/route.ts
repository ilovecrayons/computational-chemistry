import { reactionInput, setReaction } from "../../../features/memes/feed";
import { jsonError, parseBody, requireUser } from "../../../lib/api";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const value = await parseBody(request, reactionInput);
    return Response.json(setReaction(user.id, value.memeId, value.reaction));
  } catch (error) {
    return jsonError(error);
  }
}

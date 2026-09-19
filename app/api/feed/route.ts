import { getFeed } from "../../../features/memes/feed";
import { jsonError, requireUser } from "../../../lib/api";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(
      getFeed(user.id, new URL(request.url).searchParams.get("cursor")),
    );
  } catch (error) {
    return jsonError(error);
  }
}

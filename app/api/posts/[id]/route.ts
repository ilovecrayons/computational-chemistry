import { getPost } from "../../../../features/social/social";
import { jsonError, requireUser } from "../../../../lib/api";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json({ meme: getPost(user.id, id) });
  } catch (error) {
    return jsonError(error);
  }
}

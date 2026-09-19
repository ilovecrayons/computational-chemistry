import {
  addComment,
  commentInput,
  getComments,
} from "../../../../../features/social/social";
import { jsonError, parseBody, requireUser } from "../../../../../lib/api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json(getComments(user.id, id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json(
      addComment(user.id, id, await parseBody(request, commentInput)),
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

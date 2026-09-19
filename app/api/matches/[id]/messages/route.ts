import {
  getMessages,
  messageInput,
  sendMessage,
} from "../../../../../features/chat/chat";
import { jsonError, parseBody, requireUser } from "../../../../../lib/api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json(
      getMessages(user.id, id, new URL(request.url).searchParams.get("cursor")),
    );
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json(
      sendMessage(user.id, id, await parseBody(request, messageInput)),
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

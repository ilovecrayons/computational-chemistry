import { markNotificationsRead } from "../../../../features/social/social";
import { jsonError, requireUser } from "../../../../lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(markNotificationsRead(user.id));
  } catch (error) {
    return jsonError(error);
  }
}

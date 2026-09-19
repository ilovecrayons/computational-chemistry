import { getNotifications } from "../../../features/social/social";
import { jsonError, requireUser } from "../../../lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ notifications: getNotifications(user.id) });
  } catch (error) {
    return jsonError(error);
  }
}

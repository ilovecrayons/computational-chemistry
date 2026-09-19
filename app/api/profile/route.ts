import {
  getMe,
  profileInput,
  saveProfile,
} from "../../../features/profile/profile";
import {
  jsonError,
  parseBody,
  PROFILE_BODY_LIMIT,
  requireUser,
} from "../../../lib/api";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(getMe(user.id));
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(
      saveProfile(
        user.id,
        await parseBody(request, profileInput, PROFILE_BODY_LIMIT),
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}

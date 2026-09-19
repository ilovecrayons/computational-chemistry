import {
  getBrowseCandidates,
  getCandidates,
} from "../../../features/matching/engine";
import { jsonError, requireUser } from "../../../lib/api";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const browse = new URL(request.url).searchParams.get("browse") === "1";
    return Response.json({
      candidates: browse
        ? getBrowseCandidates(user.id)
        : getCandidates(user.id),
    });
  } catch (error) {
    return jsonError(error);
  }
}

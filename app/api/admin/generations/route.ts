import { recentGenerations } from "../../../../features/memes/generation";
import { jsonError, requireAdmin } from "../../../../lib/api";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdmin(request);
    return Response.json(
      { generations: recentGenerations() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

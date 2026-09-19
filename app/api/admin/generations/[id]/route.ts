import { getGeneration } from "../../../../../features/memes/generation";
import { jsonError, requireAdmin } from "../../../../../lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireAdmin(request);
    const { id } = await context.params;
    return Response.json(
      { generation: await getGeneration(id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

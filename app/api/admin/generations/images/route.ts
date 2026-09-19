import {
  beginGeneration,
  generationInput,
} from "../../../../../features/memes/generation";
import { jsonError, parseBody, requireAdmin } from "../../../../../lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireAdmin(request);
    const input = await parseBody(request, generationInput);
    const generation = await beginGeneration("image", input, user.id);
    return Response.json(
      { generation },
      {
        status: generation.status === "generating" ? 202 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}

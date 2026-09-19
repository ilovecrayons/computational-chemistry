import { seedDemo } from "../../../../db/seed";
import { ApiFailure, jsonError, requireAdmin } from "../../../../lib/api";
import { config } from "../../../../lib/config";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    if (!config.demoMode)
      throw new ApiFailure(403, "DEMO_DISABLED", "Demo reset is not enabled.");
    await seedDemo();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

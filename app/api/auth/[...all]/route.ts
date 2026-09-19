import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../lib/auth";
import { checkOrigin, jsonError } from "../../../../lib/api";

export const runtime = "nodejs";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return await handlers.POST(request);
  } catch (error) {
    return jsonError(error);
  }
}

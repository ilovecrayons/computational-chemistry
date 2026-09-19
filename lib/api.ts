import { z } from "zod";
import { auth } from "./auth";
import { config } from "./config";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function checkOrigin(request: Request) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (request.headers.get("origin") !== config.baseUrl) {
      throw new ApiFailure(
        403,
        "INVALID_ORIGIN",
        "This request must come from the application.",
      );
    }
  }
}
export async function requireUser(request: Request): Promise<{ id: string }> {
  checkOrigin(request);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    throw new ApiFailure(401, "UNAUTHENTICATED", "Sign in to continue.");
  return { id: session.user.id };
}
export async function requireAdmin(request: Request): Promise<{ id: string }> {
  const user = await requireUser(request);
  if (
    process.env.NODE_ENV === "production" &&
    !(config.demoMode && user.id === "demo-alex")
  ) {
    throw new ApiFailure(
      403,
      "FORBIDDEN",
      "Generation and demo controls are restricted to an administrator.",
    );
  }
  return user;
}
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_384)
    throw new ApiFailure(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
  const text = await request.text();
  if (text.length > 16_384)
    throw new ApiFailure(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiFailure(400, "INVALID_JSON", "Send a valid JSON request.");
  }
  return schema.parse(value);
}
export function jsonError(error: unknown): Response {
  if (error instanceof ApiFailure)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  if (error instanceof z.ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues)
      fields[issue.path.join(".") || "form"] ??= issue.message;
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Check the highlighted fields.",
          fields,
        },
      },
      { status: 400 },
    );
  }
  console.error(
    "Application request failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    },
    { status: 500 },
  );
}

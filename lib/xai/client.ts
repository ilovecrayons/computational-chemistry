import { XaiFailure } from "./video";

export const IMAGE_MODEL = "grok-imagine-image-2.0";
export const VIDEO_MODEL = "grok-imagine-video-1.5";
const API = "https://api.x.ai/v1";

export function requireXaiKey(): string {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key)
    throw new XaiFailure(
      "XAI_NOT_CONFIGURED",
      "Real generation is unavailable. Set XAI_API_KEY on the server; the offline demo does not need a key.",
    );
  return key;
}

async function request(
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const key = requireXaiKey();
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(body ? 180_000 : 30_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new XaiFailure(
      "XAI_UNREACHABLE",
      "The provider did not respond in time. No automatic paid retry was started.",
      true,
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403)
      throw new XaiFailure(
        "XAI_ACCESS_DENIED",
        "The xAI key or account does not have access to this generation model.",
      );
    if (response.status === 429)
      throw new XaiFailure(
        "XAI_RATE_LIMITED",
        "The provider rate limit was reached. Wait before making another request.",
        true,
      );
    if (response.status === 404)
      throw new XaiFailure(
        "XAI_NOT_FOUND",
        "The provider model or video request is unavailable.",
      );
    if (response.status === 400 || response.status === 422)
      throw new XaiFailure(
        "XAI_REJECTED",
        "The provider rejected the request or its content. No automatic paid retry was started.",
      );
    throw new XaiFailure(
      "XAI_UNAVAILABLE",
      "The provider is currently unavailable. No automatic paid retry was started.",
      true,
    );
  }
  // URL-only responses should be small. Never retain or serialize arbitrary provider payloads.
  const reader = response.body?.getReader();
  if (!reader)
    throw new XaiFailure(
      "XAI_INVALID_RESPONSE",
      "The provider returned an empty response.",
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
        await reader.cancel().catch(() => {});
        throw new XaiFailure(
          "XAI_INVALID_RESPONSE",
          "The provider response exceeded the safe size limit.",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof XaiFailure) throw error;
    throw new XaiFailure(
      "XAI_UNREACHABLE",
      "The provider response was interrupted. No automatic paid retry was started.",
      true,
    );
  } finally {
    reader.releaseLock();
  }
  try {
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error("shape");
    return result as Record<string, unknown>;
  } catch {
    throw new XaiFailure(
      "XAI_INVALID_RESPONSE",
      "The provider returned an unreadable response.",
    );
  }
}

export async function generateImage(prompt: string): Promise<string> {
  const result = await request("/images/generations", {
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    aspect_ratio: "9:16",
    response_format: "url",
    resolution: "1k",
  });
  const image = Array.isArray(result.data)
    ? (result.data[0] as
        { url?: unknown; respect_moderation?: unknown } | undefined)
    : undefined;
  if (
    image?.respect_moderation === false ||
    result.respect_moderation === false
  )
    throw new XaiFailure(
      "XAI_MODERATION",
      "The generated image was blocked by content moderation. No automatic paid retry was started.",
    );
  if (typeof image?.url !== "string" || !image.url)
    throw new XaiFailure(
      "XAI_INVALID_RESPONSE",
      "The provider did not return a downloadable image.",
    );
  return image.url;
}

export async function startVideo(prompt: string): Promise<string> {
  const result = await request("/videos/generations", {
    model: VIDEO_MODEL,
    prompt,
    duration: 6,
    aspect_ratio: "9:16",
    resolution: "480p",
    generate_audio: false,
  });
  if (
    typeof result.request_id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,200}$/.test(result.request_id)
  )
    throw new XaiFailure(
      "XAI_INVALID_RESPONSE",
      "The provider did not return a valid video request identifier.",
    );
  return result.request_id;
}

export async function pollVideo(requestId: string): Promise<unknown> {
  return request(`/videos/${encodeURIComponent(requestId)}`);
}

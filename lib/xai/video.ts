export class XaiFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly transient = false,
  ) {
    super(message);
    this.name = "XaiFailure";
  }
}

type VideoState =
  | { status: "generating" }
  | { status: "ready"; url: string }
  | { status: "failed" | "expired"; failure: string };

const failures: Record<string, string> = {
  invalid_argument:
    "The provider rejected this request or its content. Review the generation settings before creating a new request.",
  permission_denied:
    "This xAI account does not have permission to generate this video.",
  failed_precondition:
    "The selected model does not support these generation settings.",
  service_unavailable:
    "The provider could not complete this video because its service was unavailable.",
  internal_error: "The provider could not complete this video.",
};

export function mapVideoState(payload: unknown): VideoState {
  if (!payload || typeof payload !== "object")
    throw new XaiFailure(
      "XAI_INVALID_RESPONSE",
      "The provider returned an invalid video status.",
    );
  const value = payload as Record<string, unknown>;
  switch (value.status) {
    case "pending":
      return { status: "generating" };
    case "expired":
      return {
        status: "expired",
        failure:
          "The provider video request expired. No automatic paid retry was started.",
      };
    case "failed": {
      const error = value.error as { code?: unknown } | undefined;
      const message =
        typeof error?.code === "string" ? failures[error.code] : undefined;
      return {
        status: "failed",
        failure:
          message ??
          "The provider could not complete this video. No automatic paid retry was started.",
      };
    }
    case "done": {
      const video = value.video as
        { url?: unknown; respect_moderation?: unknown } | undefined;
      if (video?.respect_moderation === false) {
        return {
          status: "failed",
          failure:
            "The generated video was blocked by content moderation. No automatic paid retry was started.",
        };
      }
      if (typeof video?.url !== "string" || video.url.length === 0) {
        throw new XaiFailure(
          "XAI_INVALID_RESPONSE",
          "The provider marked a video done without returning a downloadable asset.",
        );
      }
      return { status: "ready", url: video.url };
    }
    default:
      throw new XaiFailure(
        "XAI_INVALID_RESPONSE",
        "The provider returned an unknown video status.",
      );
  }
}

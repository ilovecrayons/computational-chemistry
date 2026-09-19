"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  X,
  ArrowRight,
  WarningCircle,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerSlash,
} from "@phosphor-icons/react";
import type { ApiError, Meme } from "@/lib/contracts";
import { getXPost, XEmbed } from "./x-embed";

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  ).catch(() => {
    throw new RequestError(
      "Could not connect. Check your connection and try again.",
      0,
    );
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiError | null)?.error;
    throw new RequestError(
      error && typeof error === "object"
        ? error.message
        : data?.message ||
            "That did not save. Check your connection and try again.",
      response.status,
      error && typeof error === "object" ? error.fields : undefined,
    );
  }
  return data as T;
}
export function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p className="error-note" role="alert">
      <WarningCircle size={20} aria-hidden />
      {error}
    </p>
  ) : null;
}
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loading" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton" key={i} />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="empty">
      <span className="empty-mark" aria-hidden>
        ?
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}
export function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="tags">
      {tags.slice(0, 3).map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}
export function ProfileVisual({
  name,
  label,
  src,
  className = "",
}: {
  name: string;
  label?: string;
  src?: string | null;
  className?: string;
}) {
  const accessibleLabel = label ?? `${name}'s profile`;
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const temporary = !src || src.startsWith("/demo/");
  useEffect(() => {
    setFailed(false);
    if (temporary || !src) return;
    const timer = setTimeout(() => {
      const image = imageRef.current;
      if (image?.complete && image.naturalWidth === 0) setFailed(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [src, temporary]);
  return temporary || failed ? (
    <span
      className={`profile-visual ${className}`}
      aria-label={accessibleLabel}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  ) : (
    <img
      className={`profile-visual ${className}`}
      ref={imageRef}
      src={src}
      alt={accessibleLabel}
      onError={() => setFailed(true)}
    />
  );
}
export function Dialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const fallback = element.closest<HTMLElement>("main[tabindex]");
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      const target =
        trigger &&
        trigger !== document.body &&
        trigger !== document.documentElement &&
        trigger.isConnected &&
        !trigger.matches(":disabled")
          ? trigger
          : fallback;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-label={title}
      aria-modal="true"
      onKeyDown={(event) => {
        if (
          event.key !== "Tab" ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, [href], input, select, textarea, [tabindex], [contenteditable]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            !element.closest("[inert]") &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility === "visible",
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        // Native modal inertness does not prevent Tab reaching browser chrome.
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus({ preventScroll: true });
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="sheet-head">
        <h2>{title}</h2>
        <button
          ref={closeButton}
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={24} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function MemeMedia({
  meme,
  compact = false,
  fill = false,
  active = true,
}: {
  meme: Meme;
  compact?: boolean;
  fill?: boolean;
  active?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const xPost = getXPost(meme);
  const external = String(meme.type) === "x";
  const localMeme = meme as unknown as {
    id: string;
    type: "image" | "video";
    src: string;
    poster: string | null;
    caption: string;
  };
  const isVideo = localMeme.type === "video";
  useEffect(() => {
    setFailed(false);
    setMuted(true);
    setPausedByUser(false);
    setPlayError(null);
  }, [meme.id]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || compact || !active || xPost) return;
    let visible = false;
    const update = () => {
      if (visible && !document.hidden && !pausedByUser)
        void video.play().catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = (entries[0]?.intersectionRatio || 0) >= 0.6;
        update();
      },
      { threshold: 0.6 },
    );
    observer.observe(video);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      video.pause();
    };
  }, [active, compact, failed, pausedByUser, xPost?.id]);
  const video = isVideo && !compact && active && !failed;
  if (xPost) {
    return (
      <div className={`meme-media ${compact ? "compact" : ""} ${fill ? "fill" : ""} x-media`}>
        <XEmbed post={xPost} caption={meme.caption} compact={compact} active={active} />
      </div>
    );
  }
  if (external) {
    return (
      <div className={`meme-media ${compact ? "compact" : ""} ${fill ? "fill" : ""} x-media`}>
        <div className="x-embed x-embed-compact">
          <div className="x-embed-fallback">
            <p>{meme.caption || "This original X post is unavailable."}</p>
            <p className="x-embed-status">The original post metadata is unavailable.</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`meme-media ${compact ? "compact" : ""} ${fill ? "fill" : ""} ${video ? "video-media" : ""}`}
    >
      {failed ? (
        <>
          <img
            src="/fallback.svg"
            alt="This meme is unavailable. You can continue to the next one."
          />
          <span className="media-status">Media unavailable. Keep judging.</span>
        </>
      ) : video ? (
        <>
          <video
            key={meme.id}
            ref={videoRef}
            src={localMeme.src}
            poster={localMeme.poster || "/fallback.svg"}
            muted={muted}
            loop
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            onPlay={() => {
              setPlaying(true);
              setPlayError(null);
            }}
            onPause={() => setPlaying(false)}
            aria-label={meme.caption}
          />
          {!fill && (
            <div className="media-controls">
              <button
                type="button"
                onClick={() => {
                  if (playing) {
                    setPausedByUser(true);
                    videoRef.current?.pause();
                  } else {
                    setPausedByUser(false);
                    void videoRef.current
                      ?.play()
                      .catch(() =>
                        setPlayError("Playback did not start. Try again."),
                      );
                  }
                }}
                aria-label={playing ? "Pause video" : "Play video"}
              >
                {playing ? (
                  <Pause size={16} weight="fill" />
                ) : (
                  <Play size={16} weight="fill" />
                )}
                <span>{playing ? "Pause" : "Play"}</span>
              </button>
              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted ? "Turn sound on" : "Mute video"}
                aria-pressed={!muted}
              >
                {muted ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
                <span>{muted ? "Sound off" : "Sound on"}</span>
              </button>
            </div>
          )}
          {playError && (
            <span className="media-status" role="alert">
              {playError}
            </span>
          )}
        </>
      ) : (
        <img
          src={isVideo ? localMeme.poster || "/fallback.svg" : localMeme.src}
          alt={localMeme.caption}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {aside}
    </div>
  );
}
export function GoButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="button primary full" onClick={onClick}>
      {children}
      <ArrowRight size={20} />
    </button>
  );
}

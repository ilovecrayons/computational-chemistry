"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Meme, XPost } from "@/lib/contracts";

export type XPostLike = XPost;

type TweetWidgets = {
  widgets?: {
    createTweet: (
      id: string,
      element: HTMLElement,
      options?: {
        dnt?: boolean;
        conversation?: "all" | "none";
        theme?: "light" | "dark";
        align?: "left" | "center" | "right";
        width?: number;
      },
    ) => Promise<HTMLElement | undefined>;
  };
};

declare global {
  interface Window {
    twttr?: TweetWidgets;
  }
}

let widgetsPromise: Promise<TweetWidgets> | null = null;
const widgetsUrl = "https://platform.twitter.com/widgets.js";

function loadWidgets(): Promise<TweetWidgets> {
  const existingWidgets = window.twttr;
  if (existingWidgets?.widgets?.createTweet) return Promise.resolve(existingWidgets);
  if (widgetsPromise) return widgetsPromise;

  widgetsPromise = new Promise<TweetWidgets>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${widgetsUrl}"]`,
    );
    const script = existingScript ?? document.createElement("script");
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (error) {
        reject(error);
        return;
      }
      const widgets = window.twttr;
      if (widgets?.widgets?.createTweet) resolve(widgets);
      else reject(new Error("The X embed service did not initialize."));
    };
    const onLoad = () => finish();
    const onError = () =>
      finish(new Error("The X embed service could not be reached."));
    const timeout = window.setTimeout(
      () => finish(new Error("The X embed service took too long to initialize.")),
      6000,
    );
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existingScript) {
      script.async = true;
      script.src = widgetsUrl;
      script.charset = "utf-8";
      document.head.appendChild(script);
    } else if (window.twttr?.widgets?.createTweet) {
      finish();
    }
  }).catch((error) => {
    widgetsPromise = null;
    const failedScript = document.querySelector<HTMLScriptElement>(
      `script[src="${widgetsUrl}"]`,
    );
    if (!window.twttr?.widgets?.createTweet) failedScript?.remove();
    throw error;
  });
  return widgetsPromise;
}

function validXHost(hostname: string) {
  return (
    hostname === "x.com" ||
    hostname.endsWith(".x.com") ||
    hostname === "twitter.com" ||
    hostname.endsWith(".twitter.com")
  );
}

function canonicalPostUrl(post: XPostLike) {
  if (!/^\d+$/.test(post.id)) return null;
  try {
    const url = new URL(post.url);
    if (url.protocol !== "https:" || !validXHost(url.hostname))
      return `https://x.com/i/status/${post.id}`;
    return url.toString();
  } catch {
    return `https://x.com/i/status/${post.id}`;
  }
}

export function getXPost(meme: Meme): XPostLike | null {
  return meme.type === "x" ? meme.xPost : null;
}

export function XEmbed({
  post,
  caption,
  compact = false,
  active = true,
  warm = active,
  fit = false,
}: {
  post: XPostLike;
  caption: string;
  compact?: boolean;
  active?: boolean;
  warm?: boolean;
  fit?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sourceUrl = useMemo(() => canonicalPostUrl(post), [post.id, post.url]);
  const valid = Boolean(sourceUrl && /^\d+$/.test(post.id));
  const shouldMountWidget = !compact && valid && (active || warm);

  useEffect(() => {
    const host = containerRef.current;
    if (!host || !shouldMountWidget) {
      setStatus("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    let timer = 0;
    let fitFrame = 0;
    const mount = document.createElement("div");
    mount.className = "x-embed-widget-mount";
    host.replaceChildren(mount);
    setStatus("loading");
    setError(null);

    const fitWidget = () => {
      fitFrame = 0;
      if (!fit || cancelled || !host.clientWidth || !host.clientHeight) return;
      mount.style.transform = "none";
      const bounds = mount.getBoundingClientRect();
      const intrinsicWidth = Math.ceil(Math.max(mount.scrollWidth, bounds.width));
      const intrinsicHeight = Math.ceil(Math.max(mount.scrollHeight, bounds.height));
      if (!intrinsicWidth || !intrinsicHeight) return;
      const scale = Math.min(
        1,
        host.clientWidth / intrinsicWidth,
        host.clientHeight / intrinsicHeight,
      );
      mount.style.transform = `scale(${scale})`;
      mount.dataset.scale = String(scale);
    };
    const scheduleFit = () => {
      if (!fit || fitFrame || cancelled) return;
      fitFrame = window.requestAnimationFrame(fitWidget);
    };
    const resizeObserver = fit && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleFit)
      : null;
    if (fit) {
      resizeObserver?.observe(host);
      resizeObserver?.observe(mount);
    }
    const observeIframe = () => {
      if (!fit) return;
      mount.querySelectorAll("iframe").forEach((iframe) => {
        iframe.addEventListener("load", scheduleFit);
        resizeObserver?.observe(iframe);
      });
      scheduleFit();
    };

    const retire = (cause: unknown) => {
      if (cancelled) return;
      cancelled = true;
      window.clearTimeout(timer);
      if (fitFrame) window.cancelAnimationFrame(fitFrame);
      resizeObserver?.disconnect();
      mount.remove();
      setError(cause instanceof Error ? cause.message : "The original X post could not load.");
      setStatus("error");
    };
    timer = window.setTimeout(
      () => retire(new Error("The original X post took too long to load.")),
      12000,
    );

    void loadWidgets()
      .then((widgets) => {
        if (cancelled) return undefined;
        const createTweet = widgets.widgets?.createTweet;
        if (!createTweet) throw new Error("The X embed service did not initialize.");
        return createTweet(post.id, mount, {
          dnt: true,
          conversation: "none",
          theme: "dark",
          width: Math.min(550, Math.max(250, host.clientWidth)),
          align: "center",
        });
      })
      .then((tweet) => {
        if (cancelled) return;
        if (!tweet) {
          retire(new Error("X did not return an embeddable post."));
          return;
        }
        window.clearTimeout(timer);
        observeIframe();
        setStatus("ready");
      })
      .catch((cause: unknown) => retire(cause));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (fitFrame) window.cancelAnimationFrame(fitFrame);
      resizeObserver?.disconnect();
      mount.remove();
    };
  }, [compact, fit, post.id, retry, shouldMountWidget, sourceUrl, valid]);

  return (
    <div
      className={`x-embed ${compact ? "x-embed-compact" : ""} ${status === "error" ? "x-embed-error" : ""}`}
      data-active={active ? "true" : "false"}
      data-fit={fit ? "true" : "false"}
    >
      <div className="x-embed-heading">
        <span className="x-embed-mark" aria-hidden>
          𝕏
        </span>
        <span>
          Original post by <strong>{post.author || "the original author"}</strong>
        </span>
      </div>
      {!shouldMountWidget ? (
        <div className="x-embed-fallback">
          <p>{caption || "This post is available on X."}</p>
          {!valid && <p className="x-embed-status">The post metadata is unavailable.</p>}
          <a href={sourceUrl ?? "https://x.com"} target="_blank" rel="noopener noreferrer">
            Open original on X
          </a>
        </div>
      ) : (
        <>
          <div ref={containerRef} className="x-embed-frame" aria-label={`Original X post by ${post.author}`} />
          <div className="x-embed-footer">
            {status === "loading" && <p className="x-embed-status" role="status">Loading the original post…</p>}
            {status === "error" && (
              <div className="x-embed-fallback" role="alert">
                <p>{caption || "This original X post is unavailable here."}</p>
                <p className="x-embed-status">{error ?? "X could not load this post."}</p>
                <div className="x-embed-actions">
                  <button type="button" onClick={() => setRetry((value) => value + 1)}>
                    Retry
                  </button>
                </div>
              </div>
            )}
            <a className="x-source-link" href={sourceUrl ?? "https://x.com"} target="_blank" rel="noopener noreferrer">
              Open original on X
            </a>
          </div>
        </>
      )}
    </div>
  );
}


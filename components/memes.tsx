"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowRight,
  BookmarkSimple,
  ChatCircle,
  Heart,
  ShareNetwork,
} from "@phosphor-icons/react";
import type { FeedComment, Meme, Reaction } from "@/lib/contracts";
import {
  api,
  CardSkeleton,
  Dialog,
  Empty,
  ErrorNote,
  Loading,
  MemeMedia,
  SectionTitle,
} from "./ui";
import { XEmbed } from "./x-embed";

type OpenComments = { postId: string; items: FeedComment[] };

type CardRef = (element: HTMLElement | null) => void;
export function FeedScreen({
  onViewProfile,
  onPositiveReaction,
  postId,
}: {
  onViewProfile: (profileId: string) => void;
  onPositiveReaction?: (memeId: string) => void;
  postId?: string;
}) {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<OpenComments | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentsBusy, setCommentsBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const visibleRatios = useRef(new Map<string, number>());
  const activeIdRef = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const cursorRequest = useRef<{ generation: number; cursor: string } | null>(null);
  const setCurrentId = useCallback((id: string | null) => {
    if (activeIdRef.current === id) return;
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const scrollToCard = useCallback((id: string, behavior: ScrollBehavior = "smooth") => {
    cardRefs.current.get(id)?.scrollIntoView({ behavior, block: "start" });
  }, []);

  const load = useCallback(
    async (next?: string | null, generation = loadGeneration.current) => {
      if (generation !== loadGeneration.current) return;
      if (next) {
        const request = cursorRequest.current;
        if (request?.generation === generation && request.cursor === next) return;
        cursorRequest.current = { generation, cursor: next };
      }
      setLoading(true);
      setError(null);
      let directError: string | null = null;
      let direct: Meme | null = null;
      if (!next && postId) {
        try {
          direct = (await api<{ meme: Meme }>(`/api/posts/${encodeURIComponent(postId)}`)).meme;
        } catch (cause) {
          if (generation !== loadGeneration.current) return;
          directError = cause instanceof Error
            ? `That shared post is unavailable. Showing your feed instead. ${cause.message}`
            : "That shared post is unavailable. Showing your feed instead.";
        }
      }
      if (generation !== loadGeneration.current) return;
      try {
        const data = await api<{ memes: Meme[]; nextCursor: string | null }>(
          next ? `/api/feed?cursor=${encodeURIComponent(next)}` : "/api/feed",
        );
        if (generation !== loadGeneration.current) return;
        const incoming = direct
          ? [direct, ...data.memes.filter((meme) => meme.id !== direct.id)]
          : data.memes;
        setMemes((previous) => {
          if (generation !== loadGeneration.current) return previous;
          if (!next) return incoming;
          const seen = new Set(previous.map((meme) => meme.id));
          return [
            ...previous,
            ...data.memes.filter((meme) => {
              if (seen.has(meme.id)) return false;
              seen.add(meme.id);
              return true;
            }),
          ];
        });
        if (generation !== loadGeneration.current) return;
        setCursor(data.nextCursor);
        if (!next) {
          const first = direct?.id ?? data.memes[0]?.id ?? null;
          setCurrentId(first);
          if (direct) {
            window.setTimeout(() => {
              if (generation === loadGeneration.current) scrollToCard(direct!.id, "auto");
            }, 0);
          }
        }
        setError(directError);
      } catch (cause) {
        if (generation !== loadGeneration.current) return;
        setError(cause instanceof Error ? cause.message : "Could not load posts.");
        if (!next) {
          setMemes((previous) =>
            generation === loadGeneration.current ? [] : previous,
          );
        }
      } finally {
        if (cursorRequest.current?.generation === generation && cursorRequest.current.cursor === next) {
          cursorRequest.current = null;
        }
        if (generation === loadGeneration.current) setLoading(false);
      }
    },
    [postId, scrollToCard, setCurrentId],
  );

  useEffect(() => {
    const generation = ++loadGeneration.current;
    cursorRequest.current = null;
    visibleRatios.current.clear();
    setMemes([]);
    setCursor(null);
    setCurrentId(null);
    void load(undefined, generation);
    return () => {
      if (loadGeneration.current === generation) loadGeneration.current += 1;
      cursorRequest.current = null;
    };
  }, [load, setCurrentId]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    visibleRatios.current.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.postId;
          if (id) visibleRatios.current.set(id, entry.intersectionRatio);
        }
        let visibleId: string | null = null;
        let visibleRatio = 0;
        for (const [id, ratio] of visibleRatios.current) {
          if (ratio > visibleRatio) {
            visibleId = id;
            visibleRatio = ratio;
          }
        }
        if (visibleId) setCurrentId(visibleId);
      },
      { root, threshold: [0.2, 0.45, 0.7], rootMargin: "-8% 0px -8%" },
    );
    for (const card of cardRefs.current.values()) observer.observe(card);
    return () => observer.disconnect();
  }, [memes, setCurrentId]);

  function registerCard(id: string): CardRef {
    return (element) => {
      if (element) cardRefs.current.set(id, element);
      else cardRefs.current.delete(id);
    };
  }

  function nextCard(id: string, direction: 1 | -1) {
    const index = memes.findIndex((meme) => meme.id === id);
    if (index < 0) return;
    const next = memes[index + direction];
    if (next) scrollToCard(next.id);
  }

  async function react(id: string, reaction: Reaction) {
    const current = memes.find((meme) => meme.id === id);
    if (!current || pendingIds.has(id) || current.reaction) return;
    setPendingIds((previous) => new Set(previous).add(id));
    setError(null);
    try {
      const result = await api<{
        tags: string[];
        reactionCount: number;
        reaction?: Reaction | null;
        newPositive?: boolean;
      }>("/api/reactions", {
        memeId: id,
        reaction,
      });
      const persistedReaction = result.reaction === undefined ? reaction : result.reaction;
      setMemes((previous) => previous.map((item) =>
        item.id === id ? { ...item, reaction: persistedReaction } : item,
      ));
      if (result.newPositive === true) onPositiveReaction?.(id);
      nextCard(id, 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That reaction did not save.");
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }

  function haptic() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
  }

  async function openComments(id: string) {
    haptic();
    setComments({ postId: id, items: [] });
    setCommentsBusy(true);
    try {
      const items = await api<FeedComment[]>(`/api/posts/${encodeURIComponent(id)}/comments`);
      setComments((previous) => previous?.postId === id ? { postId: id, items } : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load comments.");
    } finally {
      setCommentsBusy(false);
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const open = comments;
    const body = commentText.trim();
    if (!open || commentsBusy || !body) return;
    setCommentsBusy(true);
    try {
      const comment = await api<FeedComment>(
        `/api/posts/${encodeURIComponent(open.postId)}/comments`,
        { body },
      );
      setComments((previous) => previous?.postId === open.postId
        ? { ...previous, items: [...previous.items, comment] }
        : previous);
      setCommentText("");
      setMemes((previous) => previous.map((item) =>
        item.id === open.postId
          ? { ...item, commentCount: (item.commentCount ?? 0) + 1 }
          : item,
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that comment.");
    } finally {
      setCommentsBusy(false);
    }
  }

  async function savePost(id: string) {
    if (pendingIds.has(id)) return;
    haptic();
    setPendingIds((previous) => new Set(previous).add(id));
    try {
      const result = await api<{ saved: boolean }>(
        `/api/posts/${encodeURIComponent(id)}/save`,
        {},
      );
      setMemes((previous) => previous.map((item) =>
        item.id === id ? { ...item, saved: result.saved } : item,
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update saved posts.");
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }

  async function sharePost(id: string) {
    const current = memes.find((meme) => meme.id === id);
    if (!current) return;
    haptic();
    const url = `${window.location.origin}/?view=memes&post=${encodeURIComponent(id)}`;
    try {
      if (navigator.share) await navigator.share({ title: current.caption || "A post", url });
      else await navigator.clipboard.writeText(url);
    } catch {
      setError("Could not share this post.");
    }
  }

  function onFeedKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea")) return;
    if (event.key !== "ArrowDown" && event.key !== "PageDown" && event.key !== "ArrowUp" && event.key !== "PageUp") return;
    event.preventDefault();
    if (activeId) nextCard(activeId, event.key === "ArrowUp" || event.key === "PageUp" ? -1 : 1);
  }
  const activeIndex = activeId ? memes.findIndex((meme) => meme.id === activeId) : 0;
  const xEmbedWindow = new Set<string>();
  if (activeIndex >= 0) {
    if (memes[activeIndex]?.type === "x") xEmbedWindow.add(memes[activeIndex].id);
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      if (memes[index]?.type === "x") {
        xEmbedWindow.add(memes[index].id);
        break;
      }
    }
    let nextX = 0;
    for (let index = activeIndex + 1; index < memes.length && nextX < 3; index += 1) {
      if (memes[index]?.type === "x") {
        xEmbedWindow.add(memes[index].id);
        nextX += 1;
      }
    }
  }

  return (
    <>
      <section className="tiktok-feed meme-feed" aria-label="Original X post feed">
        <ErrorNote error={error} />
        {error && !memes.length && (
          <button className="button secondary full" onClick={() => void load()}>
            Try again
          </button>
        )}
        {loading && !memes.length ? (
          <div className="meme-skeleton skeleton tiktok-stage" role="status" aria-label="Loading posts" />
        ) : memes.length ? (
          <div
            ref={scrollRef}
            className="feed-scroll"
            tabIndex={0}
            onKeyDown={onFeedKeyDown}
            onScroll={(event) => {
              const element = event.currentTarget;
              if (cursor && !loading && element.scrollTop + element.clientHeight >= element.scrollHeight - element.clientHeight) void load(cursor);
            }}
            aria-busy={loading}
          >
            {memes.map((meme) => {
              const pending = pendingIds.has(meme.id);
              const selectedReaction = meme.reaction ?? null;
              const reacted = selectedReaction !== null;
              const active = activeId === meme.id;
              const warm = meme.type === "x" && xEmbedWindow.has(meme.id);
              return (
                <article
                  className={`feed-card ${meme.type === "x" ? "feed-card-x" : ""} ${active ? "feed-post-active" : ""}`}
                  data-post-id={meme.id}
                  key={meme.id}
                  ref={registerCard(meme.id)}
                  tabIndex={-1}
                  aria-label={meme.author ? `Post by ${meme.author.name}` : "Original X post"}
                >
                  <div className="feed-card-media">
                    {meme.type === "x" ? (
                      <div className="meme-media fill x-media">
                        <XEmbed
                          post={meme.xPost}
                          caption={meme.caption}
                          active={active}
                          warm={warm}
                          fit={true}
                        />
                      </div>
                    ) : (
                      <MemeMedia meme={meme} fill active={active} />
                    )}
                  </div>
                  {meme.type !== "x" && <div className="meme-fyp-copy">
                    {meme.author ? (
                      <button
                        type="button"
                        className="meme-fyp-author"
                        onClick={() => onViewProfile(meme.author!.id)}
                      >
                        {meme.author.name}
                      </button>
                    ) : null}
                    <p className="meme-fyp-caption">{meme.caption}</p>
                  </div>}
                  <div className="meme-reaction-row" aria-label="Reaction choices">
                    <button
                      type="button"
                      className={`feed-reaction like ${selectedReaction === "like" ? "selected" : ""}`}
                      disabled={pending || reacted}
                      aria-pressed={selectedReaction === "like"}
                      onClick={() => void react(meme.id, "like")}
                    >
                      <Heart size={17} weight="fill" aria-hidden /> Like
                    </button>
                    <button
                      type="button"
                      className={`feed-reaction ${selectedReaction === "pass" ? "selected" : ""}`}
                      disabled={pending || reacted}
                      aria-pressed={selectedReaction === "pass"}
                      onClick={() => void react(meme.id, "pass")}
                    >
                      <ArrowRight size={17} aria-hidden /> Pass
                    </button>
                    <button
                      type="button"
                      className={`feed-reaction strong ${selectedReaction === "strong-like" ? "selected" : ""}`}
                      disabled={pending || reacted}
                      aria-pressed={selectedReaction === "strong-like"}
                      onClick={() => void react(meme.id, "strong-like")}
                    >
                      <Heart size={17} weight="bold" aria-hidden /> Strong like
                    </button>
                  </div>
                  <div className="meme-action-rail" aria-label="Post actions">
                    <button className="fyp-action social" type="button" disabled={pending} onClick={() => void openComments(meme.id)} aria-haspopup="dialog" aria-label={`View ${meme.commentCount ?? 0} comments`}>
                      <ChatCircle size={23} weight="bold" aria-hidden />
                      <span>{meme.commentCount ?? 0}</span>
                    </button>
                    <button className="fyp-action social" type="button" disabled={pending} onClick={() => void savePost(meme.id)} aria-label={meme.saved ? "Unsave this post" : "Save this post"}>
                      <BookmarkSimple size={23} weight={meme.saved ? "fill" : "bold"} aria-hidden />
                      <span>{meme.saved ? "Saved" : "Save"}</span>
                    </button>
                    <button className="fyp-action social" type="button" disabled={pending} onClick={() => void sharePost(meme.id)} aria-label="Share this post">
                      <ShareNetwork size={22} weight="bold" aria-hidden />
                      <span>Share</span>
                    </button>
                  </div>
                  {reacted && <p className="feed-reaction-state" role="status">Reaction saved.</p>}
                </article>
              );
            })}
            {loading && <Loading rows={1} />}
          </div>
        ) : (
          !error && (
            <Empty
              title="You judged the entire internet."
              action={<button className="button primary full" onClick={() => void load(cursor)}>Load more posts <ArrowRight size={20} /></button>}
            >
              More original posts are being prepared. Your reactions are saved.
            </Empty>
          )
        )}
      </section>
      {comments !== null && (
        <Dialog title="Comments" onClose={() => setComments(null)} className="comments-sheet">
          <div className="comments-list">
            {commentsBusy && !comments.items.length ? (
              <Loading />
            ) : comments.items.length ? (
              comments.items.map((comment) => (
                <article className="comment" key={comment.id}>
                  <strong>{comment.author.name}</strong>
                  <p>{comment.body}</p>
                </article>
              ))
            ) : (
              <p className="supporting">Be the first to say something.</p>
            )}
          </div>
          <form className="comment-form" onSubmit={addComment}>
            <input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add a comment" maxLength={500} disabled={commentsBusy} />
            <button className="button primary" disabled={commentsBusy || !commentText.trim()}>Post</button>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function SavedScreen({
  onViewProfile,
}: {
  onViewProfile: (profileId: string) => void;
}) {
  const [saved, setSaved] = useState<Meme[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ memes: Meme[] }>("/api/saved")
      .then((data) => setSaved(data.memes))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load saved posts."));
  }, []);

  async function removeSaved(id: string) {
    try {
      await api<{ saved: boolean }>(`/api/posts/${encodeURIComponent(id)}/save`, {});
      setSaved((previous) => previous?.filter((post) => post.id !== id) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update saved posts.");
    }
  }

  return (
    <section className="saved-screen">
      <SectionTitle title="Saved posts" />
      <ErrorNote error={error} />
      {!saved && !error ? (
        <CardSkeleton count={3} />
      ) : saved?.length ? (
        <div className="saved-post-list">
          {saved.map((post) => (
            <article className={`saved-post-card ${post.type === "x" ? "saved-x-post" : ""}`} key={post.id}>
              <MemeMedia meme={post} compact />
              <div className="saved-post-copy">
                {post.author ? (
                  <button type="button" className="saved-post-author" onClick={() => onViewProfile(post.author!.id)}>
                    {post.author.name}
                  </button>
                ) : null}
                {post.type !== "x" && <p>{post.caption}</p>}
                <button type="button" className="text-button" onClick={() => void removeSaved(post.id)}>
                  Remove from saved
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="Nothing saved yet.">Save a post and it will stay here.</Empty>
      )}
    </section>
  );
}

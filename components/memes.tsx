"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  BookmarkSimple,
  ChatCircle,
  Heart,
  ShareNetwork,
} from "@phosphor-icons/react";
import type { FeedComment, Meme, Reaction } from "@/lib/contracts";
import { useSwipe } from "./use-swipe";
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

export function FeedScreen({
  onViewProfile,
}: {
  onViewProfile: (profileId: string) => void;
}) {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentsBusy, setCommentsBusy] = useState(false);
  const reduced = useReducedMotion();
  const load = useCallback(async (next?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ memes: Meme[]; nextCursor: string | null }>(
        next ? `/api/feed?cursor=${encodeURIComponent(next)}` : "/api/feed",
      );
      setMemes((previous) =>
        next ? [...previous, ...data.memes] : data.memes,
      );
      setCursor(data.nextCursor);
    } catch (e) {
      setError((e as Error).message);
      if (!next) setMemes([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function react(reaction: Reaction) {
    if (busy || !memes[0]) return;
    const current = memes[0];
    const before = memes;
    setBusy(true);
    setError(null);
    setMemes(memes.slice(1));
    try {
      await api<{ tags: string[]; reactionCount: number }>("/api/reactions", {
        memeId: current.id,
        reaction,
      });
      if (before.length === 1) await load(cursor);
    } catch (e) {
      setMemes(before);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function haptic() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator)
      navigator.vibrate(10);
  }
  async function openComments() {
    const current = memes[0];
    if (!current) return;
    haptic();
    setComments([]);
    setCommentsBusy(true);
    try {
      setComments(
        await api<FeedComment[]>(`/api/posts/${current.id}/comments`),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommentsBusy(false);
    }
  }
  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = memes[0];
    if (!current || commentsBusy || !commentText.trim()) return;
    setCommentsBusy(true);
    try {
      const comment = await api<FeedComment>(
        `/api/posts/${current.id}/comments`,
        { body: commentText },
      );
      setComments((previous) => [...(previous ?? []), comment]);
      setCommentText("");
      setMemes((previous) =>
        previous.map((item, index) =>
          index === 0
            ? { ...item, commentCount: (item.commentCount ?? 0) + 1 }
            : item,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommentsBusy(false);
    }
  }
  async function saveCurrent() {
    const current = memes[0];
    if (!current || busy) return;
    haptic();
    try {
      const result = await api<{ saved: boolean }>(
        `/api/posts/${current.id}/save`,
        {},
      );
      setMemes((previous) =>
        previous.map((item, index) =>
          index === 0 ? { ...item, saved: result.saved } : item,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function shareCurrent() {
    const current = memes[0];
    if (!current) return;
    haptic();
    const url = `${window.location.origin}/?view=memes&post=${encodeURIComponent(current.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: "A meme", url });
      else await navigator.clipboard.writeText(url);
    } catch {
      setError("Could not share this video.");
    }
  }
  const swipe = useSwipe({
    disabled: busy || !memes[0],
    onLeft: () => void react("pass"),
    onRight: () => void react("like"),
    onUp: () => void react("strong-like"),
    onDown: () => void react("pass"),
  });
  return (
    <>
      <section className="tiktok-feed meme-feed">
      <ErrorNote error={error} />
      {error && !memes.length && (
        <button className="button secondary full" onClick={() => void load()}>
          Try again
        </button>
      )}
      {loading && !memes.length ? (
        <div
          className="meme-skeleton skeleton tiktok-stage"
          role="status"
          aria-label="Loading memes"
        />
      ) : memes[0] ? (
        <div
          className="tiktok-stage meme-stage"
          aria-busy={busy}
          {...swipe}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              className="tiktok-card meme-frame"
              key={memes[0].id}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
              transition={{ duration: reduced ? 0.08 : 0.18 }}
            >
              <MemeMedia meme={memes[0]} fill />
              <div className="meme-fyp-copy">
                {memes[0].author ? (
                  <button
                    type="button"
                    className="meme-fyp-author"
                    onClick={() => onViewProfile(memes[0].author!.id)}
                  >
                    {memes[0].author.name}
                  </button>
                ) : null}
                <p className="meme-fyp-caption">{memes[0].caption}</p>
              </div>
              <div className="meme-action-rail" aria-label="Meme actions">
                <button
                  className="fyp-action social"
                  type="button"
                  disabled={busy}
                  onClick={() => void react("like")}
                  aria-label={`Like this meme. ${memes[0].likeCount ?? 0} likes`}
                >
                  <Heart size={24} weight="fill" aria-hidden />
                  <span>{memes[0].likeCount ?? 0}</span>
                </button>
                <button
                  className="fyp-action social comments-action"
                  type="button"
                  disabled={busy}
                  onClick={() => void openComments()}
                  aria-haspopup="dialog"
                  aria-label={`View ${memes[0].commentCount ?? 0} comments`}
                >
                  <ChatCircle size={23} weight="bold" aria-hidden />
                  <span>{memes[0].commentCount ?? 0}</span>
                </button>
                <button
                  className="fyp-action social"
                  type="button"
                  disabled={busy}
                  onClick={() => void saveCurrent()}
                  aria-label={
                    memes[0].saved ? "Unsave this post" : "Save this post"
                  }
                >
                  <BookmarkSimple
                    size={23}
                    weight={memes[0].saved ? "fill" : "bold"}
                    aria-hidden
                  />
                  <span>{memes[0].saved ? "Saved" : "Save"}</span>
                </button>
                <button
                  className="fyp-action social"
                  type="button"
                  disabled={busy}
                  onClick={() => void shareCurrent()}
                  aria-label="Share this post"
                >
                  <ShareNetwork size={22} weight="bold" aria-hidden />
                  <span>Share</span>
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        !error && (
          <Empty
            title="You judged the entire internet."
            action={
              <button
                className="button primary full"
                onClick={() => void load(cursor)}
              >
                Load more memes <ArrowRight size={20} />
              </button>
            }
          >
            More nonsense is being prepared. Your reactions are saved.
          </Empty>
        )
      )}
      </section>
      {comments !== null && (
        <Dialog title="Comments" onClose={() => setComments(null)} className="comments-sheet">
          <div className="comments-list">
            {commentsBusy && !comments.length ? (
              <Loading />
            ) : comments.length ? (
              comments.map((comment) => (
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
            <input
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="Add a comment"
              maxLength={500}
              disabled={commentsBusy}
            />
            <button
              className="button primary"
              disabled={commentsBusy || !commentText.trim()}
            >
              Post
            </button>
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
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Could not load saved posts."),
      );
  }, []);

  async function removeSaved(id: string) {
    try {
      await api<{ saved: boolean }>(`/api/posts/${id}/save`, {});
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
            <article className="saved-post-card" key={post.id}>
              <MemeMedia meme={post} compact />
              <div className="saved-post-copy">
                {post.author ? (
                  <button
                    type="button"
                    className="saved-post-author"
                    onClick={() => onViewProfile(post.author!.id)}
                  >
                    {post.author.name}
                  </button>
                ) : null}
                <p>{post.caption}</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void removeSaved(post.id)}
                >
                  Remove from saved
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="Nothing saved yet.">
          Save a post and it will stay here.
        </Empty>
      )}
    </section>
  );
}

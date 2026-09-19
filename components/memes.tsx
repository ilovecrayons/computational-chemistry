"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChartBar,
  Heart,
  Smiley,
  X,
  ArrowRight,
  Sparkle,
} from "@phosphor-icons/react";
import type { Meme, Reaction, Tasteprint } from "@/lib/contracts";
import { useSwipe } from "./use-swipe";
import {
  api,
  Empty,
  ErrorNote,
  Loading,
  MemeMedia,
  SectionTitle,
  Tags,
} from "./ui";

export function FeedScreen({ onTaste }: { onTaste: () => void }) {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const swipe = useSwipe({
    disabled: busy || !memes[0],
    onLeft: () => void react("pass"),
    onRight: () => void react("like"),
    onUp: () => void react("strong-like"),
  });
  return (
    <section className="tiktok-feed meme-feed">
      <button
        className="feed-floating-button"
        aria-label="Open your tasteprint"
        onClick={onTaste}
      >
        <ChartBar size={22} weight="bold" />
      </button>
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
        <>
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
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="tiktok-dock reaction-dock" aria-busy={busy}>
            <button
              className="reaction-pill nah"
              disabled={busy}
              onClick={() => void react("pass")}
            >
              <X size={22} weight="bold" aria-hidden />
              <span>Nah</span>
            </button>
            <button
              className="reaction-pill lol"
              disabled={busy}
              onClick={() => void react("like")}
            >
              <Smiley size={28} weight="bold" aria-hidden />
              <span>LOL</span>
            </button>
            <button
              className="reaction-pill strong"
              disabled={busy}
              onClick={() => void react("strong-like")}
            >
              <Heart size={22} weight="fill" aria-hidden />
              <span>Too good</span>
            </button>
          </div>
          <p className="swipe-hint">Swipe ← pass · → like · ↑ too good</p>
        </>
      ) : (
        !error && (
          <Empty
            title="You judged the entire internet."
            action={
              <button className="button primary full" onClick={onTaste}>
                See your tasteprint <ArrowRight size={20} />
              </button>
            }
          >
            More nonsense is being prepared. Your reactions are saved.
          </Empty>
        )
      )}
    </section>
  );
}

export function TasteScreen({
  onMatches,
  onMemes,
}: {
  onMatches: () => void;
  onMemes: () => void;
}) {
  const [taste, setTaste] = useState<Tasteprint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(() => {
    setError(null);
    api<Tasteprint>("/api/tasteprint")
      .then(setTaste)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return (
    <>
      <SectionTitle
        eyebrow="The evidence is concerning"
        title="Your tasteprint."
      />
      <ErrorNote error={error} />
      {error && (
        <button className="button secondary" onClick={load}>
          Try again
        </button>
      )}
      {!taste && !error ? (
        <Loading />
      ) : (
        taste && (
          <>
            <div className="taste-intro">
              <Sparkle size={40} weight="duotone" aria-hidden />
              <h2>{taste.summary}</h2>
              <p>
                Built from {taste.reactionCount} reactions.{" "}
                {taste.positiveCount} made you laugh.
              </p>
            </div>
            {!taste.calibrated && (
              <div className="notice">
                <strong>Still getting to know your weird.</strong>
                <p>
                  Like or strong-like at least 10 memes before we calculate
                  compatibility. No made-up percentages.
                </p>
                <button className="text-button" onClick={onMemes}>
                  Keep judging <ArrowRight size={18} />
                </button>
              </div>
            )}
            <div className="taste-bars">
              {taste.tags.slice(0, 3).map((item, index) => (
                <div key={item.tag} className="taste-row">
                  <div>
                    <span className="taste-index">0{index + 1}</span>
                    <h3>{item.tag}</h3>
                  </div>
                  <div className="taste-track">
                    <span
                      style={{
                        width: `${Math.max(1, (item.weight / (taste.tags[0]?.weight || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {taste.tags.length > 3 && (
              <section className="settings-section">
                <h3>Also in your emotional support folder</h3>
                <Tags tags={taste.tags.slice(3, 6).map((t) => t.tag)} />
                {expanded && (
                  <div className="tags">
                    {taste.tags.slice(6).map((t) => (
                      <span key={t.tag}>{t.tag}</span>
                    ))}
                  </div>
                )}
                <button
                  className="text-button"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? "Show less" : "Show all tags"}
                </button>
              </section>
            )}
            <button className="button primary full" onClick={onMatches}>
              Find my people <ArrowRight size={20} />
            </button>
            <details className="explanation">
              <summary>How does this actually work?</summary>
              <p>
                The Latent LOL Compatibility Engine gives a LOL one vote and Too
                good two. A pass gives no positive weight. Rare shared tags
                matter more.
              </p>
              <p>
                Compatibility combines 80% weighted tag similarity and 20%
                overlap in your five strongest tags. These bars show relative
                weights, not scientific certainty. Your starting tags never
                inflate a score.
              </p>
            </details>
          </>
        )
      )}
    </>
  );
}

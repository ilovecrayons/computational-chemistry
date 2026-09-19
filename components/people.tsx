"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  DotsThree,
  Heart,
  PaperPlaneTilt,
  X,
} from "@phosphor-icons/react";
import type {
  Candidate,
  ChatMessage,
  Compatibility,
  Match,
  Me,
} from "@/lib/contracts";
import {
  api,
  Dialog,
  Empty,
  ErrorNote,
  Loading,
  MemeMedia,
  RequestError,
  SectionTitle,
  Tags,
} from "./ui";

function Evidence({ compatibility }: { compatibility: Compatibility }) {
  return (
    <div className="compatibility">
      <div className="score-line">
        <span>
          {compatibility.score === null
            ? "Getting calibrated"
            : "Meme compatibility"}
        </span>
        {compatibility.score !== null && (
          <strong>
            {compatibility.score}
            <small>%</small>
          </strong>
        )}
      </div>
      <p>{compatibility.explanation}</p>
      <Tags tags={compatibility.sharedTags} />
      <details className="explanation">
        <summary>Why this match?</summary>
        <p>
          {compatibility.score === null
            ? "Both people need at least 10 positive reactions before a score appears."
            : `80% weighted tag similarity (${Math.round(compatibility.cosine * 100)}%) + 20% strongest-tag overlap (${Math.round(compatibility.jaccard * 100)}%).`}
        </p>
        <p>A ranking aid for shared humor. Not a scientific prediction.</p>
        {compatibility.sharedMemes.length > 0 && (
          <>
            <h3>You both laughed at these</h3>
            <div className="shared-memes">
              {compatibility.sharedMemes.map((meme) => (
                <MemeMedia key={meme.id} meme={meme} compact />
              ))}
            </div>
          </>
        )}
      </details>
    </div>
  );
}
export function Safety({
  targetId,
  onDone,
  allowUnmatch = false,
}: {
  targetId: string;
  onDone: () => void;
  allowUnmatch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"block" | "report" | "unmatch" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/safety", {
        targetId,
        action,
        ...(action === "report" ? { reason } : {}),
      });
      setOpen(false);
      setAction(null);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="icon-button"
        aria-label="Safety options"
        onClick={() => setOpen(true)}
      >
        <DotsThree size={28} weight="bold" />
      </button>
      {open && (
        <Dialog
          title={
            action
              ? `${action[0].toUpperCase()}${action.slice(1)} this person?`
              : "Safety & boundaries"
          }
          onClose={() => {
            setOpen(false);
            setAction(null);
          }}
        >
          {!action ? (
            <div className="stack">
              {allowUnmatch && (
                <button
                  className="button secondary"
                  onClick={() => setAction("unmatch")}
                >
                  Unmatch
                </button>
              )}
              <button
                className="button secondary"
                onClick={() => setAction("block")}
              >
                Block person
              </button>
              <button
                className="button secondary"
                onClick={() => setAction("report")}
              >
                Report concern
              </button>
            </div>
          ) : (
            <div className="stack">
              <p>
                {action === "block"
                  ? "This removes your match and hides each of you from the other. They will not be notified."
                  : action === "unmatch"
                    ? "You will no longer be able to message each other. This cannot be undone in this prototype."
                    : "Your report is saved privately for prototype administrators. For urgent danger, contact local emergency services."}
              </p>
              {action === "report" && (
                <label>
                  What happened?
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={5}
                    maxLength={1000}
                    rows={4}
                  />
                </label>
              )}
              <ErrorNote error={error} />
              <button
                className="button danger"
                disabled={
                  busy || (action === "report" && reason.trim().length < 5)
                }
                onClick={submit}
              >
                {busy ? "Saving…" : `Confirm ${action}`}
              </button>
              <button
                className="button secondary"
                onClick={() => setAction(null)}
              >
                Go back
              </button>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

export function DiscoverScreen({
  me,
  onChat,
  onMemes,
}: {
  me: Me;
  onChat: (matchId: string) => void;
  onMemes: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState<Match | null>(null);
  const [notice, setNotice] = useState("");
  const reduced = useReducedMotion();
  const load = useCallback(() => {
    setError(null);
    api<{ candidates: Candidate[] }>("/api/candidates")
      .then((data) => setCandidates(data.candidates))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  async function decide(targetId: string, decision: "pass" | "like") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ match: Match | null }>(
        "/api/profile-decisions",
        { targetId, decision },
      );
      setCandidates((previous) => previous!.filter((c) => c.id !== targetId));
      if (data.match) setMatched(data.match);
      else
        setNotice(
          decision === "like"
            ? "Like sent. Mutual interest makes it a match."
            : "Passed. Keep finding your people.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const candidate = candidates?.[0];
  return (
    <>
      <SectionTitle
        eyebrow="Shared humor. Actual humans."
        title="Your kind of weird."
      />
      <p className="screen-intro">
        The internet is a lot. These people get your part of it.
      </p>
      <ErrorNote error={error} />
      {error && (
        <button className="text-button" onClick={load}>
          Try again
        </button>
      )}
      <p className="live-notice" aria-live="polite">
        {notice}
      </p>
      {!candidates && !error ? (
        <Loading />
      ) : candidate ? (
        <article className="candidate" key={candidate.id}>
          <div className="candidate-photo">
            <img
              src={candidate.photo}
              alt={`${candidate.name}'s illustrated profile portrait`}
            />
          </div>
          <div className="candidate-content">
            <div className="person-heading">
              <div>
                <h2>
                  {candidate.name}, {candidate.age}
                </h2>
                <p>{candidate.location}</p>
              </div>
              <Safety targetId={candidate.id} onDone={load} />
            </div>
            <p className="intent">
              {candidate.intent === "relationship"
                ? "Looking for a relationship"
                : candidate.intent === "casual"
                  ? "Keeping it casual"
                  : "Figuring it out"}
            </p>
            <p className="bio">{candidate.bio}</p>
            <Evidence compatibility={candidate.compatibility} />
            <div className="profile-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void decide(candidate.id, "pass")}
              >
                <X size={20} />
                Pass
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void decide(candidate.id, "like")}
              >
                <Heart size={20} weight="fill" />
                Like
              </button>
            </div>
          </div>
        </article>
      ) : (
        candidates && (
          <Empty
            title="Compatible chaos takes a moment."
            action={
              <button className="button primary full" onClick={onMemes}>
                Judge more memes <ArrowRight size={20} />
              </button>
            }
          >
            Your current preferences and decisions have narrowed the field. Try
            a few more memes or update your private preferences.
          </Empty>
        )
      )}
      {matched && (
        <Dialog
          title="It’s mutual."
          className="match-reveal"
          onClose={() => setMatched(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: reduced ? 1 : 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduced ? 0.1 : 0.6 }}
          >
            <div className="matched-portraits">
              <img src={me.profile!.photo} alt={me.profile!.name} />
              <Heart size={32} weight="fill" aria-hidden />
              <img src={matched.profile.photo} alt={matched.profile.name} />
            </div>
            <h1>
              Same damage.
              <br />
              Mutual interest.
            </h1>
            <p>
              You and {matched.profile.name} liked each other. That’s a better
              start than “hey.”
            </p>
            {matched.compatibility.sharedMemes[0] && (
              <div className="reveal-meme">
                <MemeMedia
                  meme={matched.compatibility.sharedMemes[0]}
                  compact
                />
              </div>
            )}
            <button
              className="button primary full"
              onClick={() => onChat(matched.id)}
            >
              Say something <ArrowRight size={20} />
            </button>
            <button
              className="text-button full"
              onClick={() => setMatched(null)}
            >
              Keep browsing
            </button>
          </motion.div>
        </Dialog>
      )}
    </>
  );
}

export function ChatsScreen({
  onChat,
  onDiscover,
}: {
  onChat: (id: string) => void;
  onDiscover: () => void;
}) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<{ matches: Match[] }>("/api/matches")
      .then((data) => setMatches(data.matches))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return (
    <>
      <SectionTitle
        eyebrow="Mutually questionable taste"
        title="The conversation."
      />
      <p className="screen-intro">Start with what made you both laugh.</p>
      <ErrorNote error={error} />
      {error && (
        <button className="text-button" onClick={load}>
          Try again
        </button>
      )}
      {!matches && !error ? (
        <Loading />
      ) : matches?.length ? (
        <div className="match-list">
          {matches.map((match) => (
            <button
              key={match.id}
              className="match-row"
              onClick={() => onChat(match.id)}
            >
              <img className="avatar" src={match.profile.photo} alt="" />
              <div>
                <div className="match-row-heading">
                  <h2>{match.profile.name}</h2>
                  <span title="Last activity">
                    {new Date(match.lastActivityAt).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                      },
                    )}
                  </span>
                </div>
                <p className="match-preview">
                  {match.lastMessage || "A shared meme. An excellent excuse."}
                </p>
                <span className="supporting">
                  {match.compatibility.score === null
                    ? "Still calibrating"
                    : `${match.compatibility.score}% meme compatibility`}
                </span>
              </div>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        matches && (
          <Empty
            title="Compatible chaos will appear here."
            action={
              <button className="button primary full" onClick={onDiscover}>
                Meet your people <ArrowRight size={20} />
              </button>
            }
          >
            A chat starts when you both like each other. No unsolicited “hey.”
          </Empty>
        )
      )}
    </>
  );
}

export function Conversation({
  id,
  me,
  onBack,
}: {
  id: string;
  me: Me;
  onBack: () => void;
}) {
  const [match, setMatch] = useState<Match | null>(null);
  const [{ messages, cursor }, setHistory] = useState<{
    messages: ChatMessage[];
    cursor: string | null;
  }>({ messages: [], cursor: null });
  const [body, setBody] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const seen = useRef(false);
  const fetching = useRef(false);
  const reduced = useReducedMotion();
  const merge = (existing: ChatMessage[], incoming: ChatMessage[]) =>
    Array.from(
      new Map(
        [...existing, ...incoming].map((message) => [message.id, message]),
      ).values(),
    ).sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  const load = useCallback(
    async (older?: string, poll = false) => {
      if (fetching.current || (poll && document.hidden)) return;
      fetching.current = true;
      const follow =
        !seen.current ||
        Boolean(
          thread.current &&
          thread.current.scrollHeight -
            thread.current.scrollTop -
            thread.current.clientHeight <
            96,
        );
      try {
        const data = await api<{
          messages: ChatMessage[];
          nextCursor: string | null;
          match: Match;
        }>(
          `/api/matches/${encodeURIComponent(id)}/messages${older ? `?cursor=${encodeURIComponent(older)}` : ""}`,
        );
        setMatch(data.match);
        setHistory((previous) => {
          const knownIds = new Set(
            previous.messages.map((message) => message.id),
          );
          const gap =
            data.nextCursor &&
            !data.messages.some((message) => knownIds.has(message.id));
          return {
            messages: merge(previous.messages, data.messages),
            // A disjoint newest page needs its own cursor to bridge back to loaded history.
            cursor:
              older || previous.messages.length === 0 || gap
                ? data.nextCursor
                : previous.cursor,
          };
        });
        setLoadError(null);
        setUnavailable(false);
        seen.current = true;
        if (!older && follow)
          requestAnimationFrame(() =>
            thread.current?.scrollTo({ top: thread.current.scrollHeight }),
          );
      } catch (cause) {
        setLoadError((cause as Error).message);
        if (
          cause instanceof RequestError &&
          [401, 403, 404].includes(cause.status)
        ) {
          setUnavailable(true);
          setMatch(null);
          setHistory({ messages: [], cursor: null });
        }
      } finally {
        setLoading(false);
        fetching.current = false;
      }
    },
    [id],
  );
  useEffect(() => {
    if (unavailable) return;
    void load();
    const timer = setInterval(() => void load(undefined, true), 4000);
    return () => clearInterval(timer);
  }, [load, unavailable]);
  const sharedMeme = match?.compatibility.sharedMemes[0];
  const opener = sharedMeme
    ? "Explain why this destroyed both of us."
    : "What’s the last thing that made you laugh?";
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy || unavailable) return;
    setBusy(true);
    setSendError(null);
    try {
      const result = await api<{ message: ChatMessage }>(
        `/api/matches/${encodeURIComponent(id)}/messages`,
        {
          body: body.trim(),
          ...(messages.length === 0 && share && sharedMeme
            ? { memeId: sharedMeme.id }
            : {}),
        },
      );
      setHistory((previous) => ({
        ...previous,
        messages: merge(previous.messages, [result.message]),
      }));
      setBody("");
      setShare(false);
      requestAnimationFrame(() =>
        thread.current?.scrollTo({
          top: thread.current.scrollHeight,
          behavior: reduced ? "instant" : "smooth",
        }),
      );
    } catch (cause) {
      setSendError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="conversation">
      <header className="chat-header">
        <button
          className="icon-button"
          aria-label="Back to chats"
          onClick={onBack}
        >
          <ArrowLeft size={24} />
        </button>
        {match ? (
          <>
            <img className="avatar small" src={match.profile.photo} alt="" />
            <div>
              <h1>{match.profile.name}</h1>
              <span className="supporting">
                {match.compatibility.score === null
                  ? "Mutual interest"
                  : `${match.compatibility.score}% shared nonsense`}
              </span>
            </div>
            <Safety targetId={match.profile.id} allowUnmatch onDone={onBack} />
          </>
        ) : (
          <h1>Conversation</h1>
        )}
      </header>
      <ErrorNote error={loadError} />
      {loadError && (
        <button className="text-button" onClick={() => void load()}>
          Reconnect
        </button>
      )}
      {loading ? (
        <Loading />
      ) : (
        match && (
          <>
            <div
              className="messages"
              ref={thread}
              role="log"
              aria-label="Conversation messages"
              aria-live="polite"
            >
              {cursor && (
                <button
                  className="text-button full"
                  onClick={() => void load(cursor)}
                >
                  Load earlier messages
                </button>
              )}
              {messages.length === 0 && (
                <div className="chat-context">
                  <p className="eyebrow">
                    {sharedMeme
                      ? "Your first inside joke"
                      : "A little mutual interest"}
                  </p>
                  {sharedMeme && <MemeMedia meme={sharedMeme} compact />}
                  <h2>
                    {sharedMeme
                      ? "Explain yourselves."
                      : "You already have a start."}
                  </h2>
                  <p>
                    {sharedMeme
                      ? "You both found this funny. That feels like a conversation."
                      : "You both liked each other. Find out what makes them laugh."}
                  </p>
                  <button
                    className="suggested-opener"
                    disabled={busy}
                    onClick={() => {
                      setBody(opener);
                      document.getElementById("message-body")?.focus();
                    }}
                  >
                    “{opener}”<ArrowRight size={18} />
                  </button>
                  <span className="supporting">
                    Tap to edit. Nothing sends automatically.
                  </span>
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.senderId === me.user.id ? "mine" : "theirs"}`}
                >
                  {message.memeId && (
                    <span className="message-reference">
                      About your shared meme
                    </span>
                  )}
                  <p>{message.body}</p>
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </div>
            <form className="composer" onSubmit={send} aria-busy={busy}>
              <ErrorNote error={sendError} />
              {messages.length === 0 && sharedMeme && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={share}
                    disabled={busy}
                    onChange={(event) => setShare(event.target.checked)}
                  />
                  Reference our shared meme
                </label>
              )}
              <div className="composer-row">
                <label className="sr-only" htmlFor="message-body">
                  Message
                </label>
                <textarea
                  id="message-body"
                  value={body}
                  disabled={busy}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Your message…"
                  maxLength={2000}
                  rows={1}
                  required
                />
                <button
                  className="send-button"
                  aria-label="Send message"
                  disabled={busy || !body.trim()}
                >
                  <PaperPlaneTilt size={24} weight="fill" />
                </button>
              </div>
            </form>
          </>
        )
      )}
    </section>
  );
}

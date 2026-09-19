"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  DotsThree,
  Egg,
  EggCrack,
  Heart,
  PaperPlaneTilt,
  ShareNetwork,
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
  ProfileVisual,
  RequestError,
  SectionTitle,
  Tags,
} from "./ui";
import { useSwipe } from "./use-swipe";
function pause(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function Evidence({ compatibility }: { compatibility: Compatibility }) {
  return (
    <div className="compatibility">
      <div className="score-line">
        <span>Meme match</span>
        <strong>
          {compatibility.score}
          <small>%</small>
        </strong>
      </div>
    </div>
  );
}
export function Safety({
  targetId,
  targetName = "this person",
  onDone,
  allowUnmatch = false,
}: {
  targetId: string;
  targetName?: string;
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
  async function shareProfile() {
    const url = `${window.location.origin}/?view=matches&profile=${encodeURIComponent(targetId)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${targetName} on Crackd`,
          text: `Check out ${targetName}'s profile.`,
          url,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("Profile sharing is unavailable in this browser.");
      }
      setOpen(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError((e as Error).message);
    }
  }
  return (
    <>
      <button
        className="icon-button"
        aria-label="Profile options"
        onClick={() => setOpen(true)}
      >
        <DotsThree size={28} weight="bold" />
      </button>
      {open && (
        <Dialog
          title={
            action
              ? `${action[0].toUpperCase()}${action.slice(1)} this person?`
              : "Profile options"
          }
          onClose={() => {
            setOpen(false);
            setAction(null);
          }}
        >
          {!action ? (
            <div className="stack">
              <button className="button secondary" onClick={shareProfile}>
                <ShareNetwork size={20} />
                Share profile
              </button>
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
              <ErrorNote error={error} />
            </div>
          ) : (
            <div className="stack">
              <p>
                {action === "block"
                  ? "This removes your match and hides each of you from the other. They will not be notified."
                  : action === "unmatch"
                    ? "You will no longer be able to message each other. This cannot be undone."
                    : "Your report is saved privately for support. For urgent danger, contact local emergency services."}
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
  onProfile,
  onViewProfile,
}: {
  me: Me;
  onChat: (matchId: string) => void;
  onMemes: () => void;
  onProfile: () => void;
  onViewProfile: (profileId: string) => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState<Match | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(true);
  const [outgoing, setOutgoing] = useState<"left" | "right" | null>(null);
  const [eggPhase, setEggPhase] = useState<"cracking" | "whole" | null>(null);
  const suppressPhotoTapUntil = useRef(0);
  const reduced = useReducedMotion();
  const load = useCallback(() => {
    setError(null);
    api<{ candidates: Candidate[] }>("/api/candidates")
      .then(async (data) => {
        if (data.candidates.length > 0) {
          setCandidates(data.candidates);
          return;
        }
        const browse = await api<{ candidates: Candidate[] }>(
          "/api/candidates?browse=1",
        );
        setCandidates(browse.candidates);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  async function decide(targetId: string, decision: "pass" | "like") {
    if (busy) return;
    setBusy(true);
    setError(null);
    const response = api<{ match: Match | null }>(
      "/api/profile-decisions",
      { targetId, decision },
    );
    void response.catch(() => undefined);
    try {
      if (decision === "like") {
        setEggPhase("cracking");
        await pause(360);
        setEggPhase("whole");
        await pause(520);
        setOutgoing("right");
        await pause(420);
      } else {
        setOutgoing("left");
        await pause(420);
      }
      const data = await response;
      setCandidates((previous) => previous!.filter((c) => c.id !== targetId));
      setPhotoIndex(0);
      if (data.match) setMatched(data.match);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOutgoing(null);
      setEggPhase(null);
      setBusy(false);
    }
  }
  const candidate = candidates?.[0];
  const nextCandidate = candidates?.[1];
  const photos = (
    candidate?.photos?.length
      ? candidate.photos
      : candidate?.photo
        ? [candidate.photo]
        : []
  ).filter((photo) => photo && !photo.startsWith("/demo/"));
  function photoTap() {
    if (busy || !photos.length) return;
    if (Date.now() < suppressPhotoTapUntil.current) return;
    if (showDetails) {
      setShowDetails(false);
      return;
    }
    setPhotoIndex((value) => (value + 1) % photos.length);
  }
  const swipe = useSwipe({
    disabled: busy || !candidate,
    onLeft: () => candidate && void decide(candidate.id, "pass"),
    onRight: () => candidate && void decide(candidate.id, "like"),
    onUp: () => setShowDetails(true),
    onGesture: () => {
      suppressPhotoTapUntil.current = Date.now() + 400;
    },
  });
  useEffect(() => {
    setPhotoIndex(0);
    setShowDetails(true);
  }, [candidate?.id]);
  return (
    <section className="tiktok-feed discover-feed">
      <ErrorNote error={error} />
      {error && (
        <button className="text-button" onClick={load}>
          Try again
        </button>
      )}

      {!candidates && !error ? (
        <Loading />
      ) : candidate ? (
        <>
          <div className="tiktok-stage discover-stage" {...swipe}>
            {nextCandidate && (
              <div className="discover-next-card" aria-hidden>
                <ProfileVisual
                  name={nextCandidate.name}
                  src={nextCandidate.photo}
                  className="discover-next-visual"
                />
              </div>
            )}
            <div
              className={`discover-current-card ${outgoing ? `outgoing-${outgoing}` : ""}`}
            >
            <div
              className={`discover-photos ${showDetails ? "details-visible" : "photos-only"}`}
              role="button"
              tabIndex={0}
              aria-label={
                showDetails
                  ? "Tap to view this profile's photos"
                  : `View photo ${photoIndex + 1} of ${Math.max(photos.length, 1)}`
              }
              onClick={photoTap}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  photoTap();
                }
              }}
            >
              {photos.length > 0 ? (
                photos.map((photo, index) => (
                  <img
                    key={`${candidate.id}-${index}`}
                    src={photo}
                    alt={`${candidate.name}'s profile photo ${index + 1}`}
                    hidden={index !== photoIndex}
                  />
                ))
              ) : (
                <ProfileVisual
                  name={candidate.name}
                  className="discover-profile-visual"
                />
              )}
              {!showDetails && (
                <span className="photo-mode-hint">
                  Tap for next photo · swipe up for details
                </span>
              )}
            </div>
            {showDetails && (
              <div className="discover-overlay">
              <div className="discover-heading">
                <div>
                  <button
                    type="button"
                    className="discover-profile-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onViewProfile(candidate.id);
                    }}
                  >
                    <h2>
                      {candidate.name}, {candidate.age}
                    </h2>
                  </button>
                  <p>
                    {candidate.town || candidate.location}
                    {candidate.stateCode
                      ? `, ${candidate.stateCode}`
                      : candidate.state
                        ? `, ${candidate.state}`
                        : ""}
                  </p>
                </div>
                <Safety
                  targetId={candidate.id}
                  targetName={candidate.name}
                  onDone={load}
                />
              </div>
              {candidate.bio && <p className="discover-bio">{candidate.bio}</p>}
              <Evidence compatibility={candidate.compatibility} />
            </div>
              )}
            </div>
            <AnimatePresence>
              {eggPhase && (
                <motion.div
                  key={eggPhase}
                  className="match-egg-animation"
                  initial={{ opacity: 0, scale: 0.7, y: 18 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.12, y: -12 }}
                  transition={{ duration: 0.28 }}
                >
                  {eggPhase === "cracking" ? (
                    <EggCrack size={92} weight="duotone" aria-hidden />
                  ) : (
                    <Egg size={92} weight="duotone" aria-hidden />
                  )}
                  <p>
                    {eggPhase === "cracking"
                      ? "Uncracking the match…"
                      : "Putting your weird back together…"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="tiktok-dock reaction-dock" aria-busy={busy}>
            <button
              className="reaction-pill nah"
              disabled={busy}
              onClick={() => void decide(candidate.id, "pass")}
            >
              <X size={22} weight="bold" aria-hidden />
              <span>Reject</span>
            </button>
            <button
              className="reaction-pill lol"
              disabled={busy}
              onClick={() => void decide(candidate.id, "like")}
            >
              <Heart size={22} weight="fill" aria-hidden />
              <span>Match</span>
            </button>
          </div>
        </>
      ) : (
        candidates && (
          <Empty
            title="Compatible chaos takes a moment."
            action={
              <div className="stack">
                <button className="button primary full" onClick={onMemes}>
                  Judge more memes <ArrowRight size={20} />
                </button>
                <button className="text-button full" onClick={onProfile}>
                  Update private preferences
                </button>
              </div>
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
              <ProfileVisual
                name={me.profile!.name}
                src={me.profile!.photo}
                className="matched-profile-mark"
              />
              <Heart size={32} weight="fill" aria-hidden />
              <ProfileVisual
                name={matched.profile.name}
                src={matched.profile.photo}
                className="matched-profile-mark"
              />
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
    </section>
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
                  {`${match.compatibility.score}% meme match`}
                </span>
              </div>
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
                {`${match.compatibility.score}% shared nonsense`}
              </span>
            </div>
            <Safety
              targetId={match.profile.id}
              targetName={match.profile.name}
              allowUnmatch
              onDone={onBack}
            />
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

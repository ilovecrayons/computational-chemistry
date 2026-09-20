"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControlsWithThen,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  DotsThree,
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
  CardSkeleton,
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
import styles from "./discover-motion.module.css";

function distanceLabel(distanceMiles: number | null): string {
  if (distanceMiles === null) return "Distance unavailable";
  const miles = Math.max(10, Math.ceil(distanceMiles / 10) * 10);
  return miles >= 100 ? "Within 100+ miles" : `Within ${miles} miles`;
}

const candidateCache = new Map<string, Candidate[]>();

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
type SafetyAction = "block" | "report" | "unmatch";
export function Safety({
  targetId,
  targetName = "this person",
  onDone,
  allowUnmatch = false,
}: {
  targetId: string;
  targetName?: string;
  onDone?: (action: SafetyAction) => void;
  allowUnmatch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<SafetyAction | null>(null);
  const [confirmation, setConfirmation] = useState<SafetyAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function close() {
    const completedAction = confirmation;
    setOpen(false);
    setAction(null);
    setConfirmation(null);
    setReason("");
    setError(null);
    if (completedAction) onDone?.(completedAction);
  }
  function chooseAction(next: SafetyAction) {
    setError(null);
    setAction(next);
  }
  async function submit() {
    if (!action) return;
    const completedAction = action;
    setBusy(true);
    setError(null);
    try {
      await api("/api/safety", {
        targetId,
        action: completedAction,
        ...(completedAction === "report" ? { reason } : {}),
      });
      setAction(null);
      setReason("");
      setConfirmation(completedAction);
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
        onClick={() => {
          setError(null);
          setConfirmation(null);
          setOpen(true);
        }}
      >
        <DotsThree size={28} weight="bold" />
      </button>
      {open && (
        <Dialog
          title={
            confirmation
              ? "Confirmation"
              : action
                ? `${action[0].toUpperCase()}${action.slice(1)} this person?`
                : "Profile options"
          }
          onClose={close}
        >
          {confirmation ? (
            <div className="stack">
              <p className="safety-confirmation" role="status">
                {confirmation === "report"
                  ? "Report submitted. Thanks for helping keep the community safe."
                  : confirmation === "block"
                    ? `${targetName} was blocked.`
                    : "This match was ended."}
              </p>
              <button className="button primary" onClick={close}>
                Done
              </button>
            </div>
          ) : !action ? (
            <div className="stack">
              <button className="button secondary" onClick={shareProfile}>
                <ShareNetwork size={20} />
                Share profile
              </button>
              {allowUnmatch && (
                <button
                  className="button secondary"
                  onClick={() => chooseAction("unmatch")}
                >
                  Unmatch
                </button>
              )}
              <button
                className="button secondary"
                onClick={() => chooseAction("block")}
              >
                Block person
              </button>
              <button
                className="button secondary"
                onClick={() => chooseAction("report")}
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
              <button className="button secondary" onClick={() => setAction(null)}>
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
  const [candidates, setCandidates] = useState<Candidate[] | null>(
    () => candidateCache.get(me.user.id) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(true);
  const suppressPhotoTapUntil = useRef(0);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const decisionLocked = useRef(false);
  const decisionId = useRef(0);
  const mounted = useRef(true);
  const panAnimations = useRef<AnimationPlaybackControlsWithThen[] | null>(
    null,
  );
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const rotation = useTransform(panX, [-320, 0, 320], [-13, 0, 13]);
  const passOpacity = useTransform(panX, [-120, -40, 0], [1, 0.25, 0]);
  const likeOpacity = useTransform(panX, [0, 40, 120], [0, 0.25, 1]);
  const reduced = useReducedMotion() === true;

  const stopPanAnimations = useCallback(() => {
    const animations = panAnimations.current;
    panAnimations.current = null;
    animations?.forEach((animation) => animation.stop());
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      decisionId.current += 1;
      drag.current = null;
      stopPanAnimations();
    };
  }, [stopPanAnimations]);

  const load = useCallback(() => {
    setError(null);
    api<{ candidates: Candidate[] }>("/api/candidates")
      .then(async (data) => {
        if (data.candidates.length > 0) {
          candidateCache.set(me.user.id, data.candidates);
          setCandidates(data.candidates);
          return;
        }
        const browse = await api<{ candidates: Candidate[] }>(
          "/api/candidates?browse=1",
        );
        candidateCache.set(me.user.id, browse.candidates);
        setCandidates(browse.candidates);
      })
      .catch((e) => setError(e.message));
  }, [me.user.id]);
  useEffect(load, [load]);

  const springBack = useCallback(() => {
    stopPanAnimations();
    if (reduced) {
      panX.set(0);
      panY.set(0);
      return Promise.resolve();
    }
    // Match RN Animated.spring tension=80/friction=10 in physical Motion units.
    const animations = [
      animate(panX, 0, { type: "spring", stiffness: 375, damping: 31 }),
      animate(panY, 0, { type: "spring", stiffness: 375, damping: 31 }),
    ];
    panAnimations.current = animations;
    return Promise.all(animations)
      .then(() => undefined)
      .finally(() => {
        if (panAnimations.current === animations) {
          panAnimations.current = null;
        }
      });
  }, [panX, panY, reduced, stopPanAnimations]);

  async function decide(targetId: string, decision: "pass" | "like") {
    if (decisionLocked.current || busy || !mounted.current) return;
    if (decision === "like" && candidate?.id === targetId && candidate.browseOnly) {
      void springBack();
      return;
    }
    decisionLocked.current = true;
    drag.current = null;
    const currentDecision = ++decisionId.current;
    setBusy(true);
    setError(null);
    stopPanAnimations();
    const candidateWidth =
      typeof window === "undefined" ? 0 : window.innerWidth;
    const destination = decision === "like"
      ? candidateWidth * 1.35
      : -candidateWidth * 1.35;
    let exitAnimation: Promise<void>;
    if (reduced) {
      panX.set(destination);
      panY.set(0);
      exitAnimation = Promise.resolve();
    } else {
      const animations = [
        animate(panX, destination, { duration: 0.24, ease: "easeOut" }),
        animate(panY, 0, { duration: 0.24, ease: "easeOut" }),
      ];
      panAnimations.current = animations;
      exitAnimation = Promise.all(animations)
        .then(() => undefined)
        .finally(() => {
          if (panAnimations.current === animations) {
            panAnimations.current = null;
          }
        });
    }
    const request = api<{ match: Match | null }>(
      "/api/profile-decisions",
      { targetId, decision },
    );
    const isCurrentDecision = () =>
      mounted.current && decisionId.current === currentDecision;
    try {
      const [data] = await Promise.all([request, exitAnimation]);
      if (!isCurrentDecision()) return;
      if (decision === "like" && !data.match) {
        await springBack();
        if (!isCurrentDecision()) return;
        setError("This profile is unavailable for matching with your preferences.");
        return;
      }
      const next = candidates?.filter((item) => item.id !== targetId) ?? [];
      candidateCache.set(me.user.id, next);
      setCandidates(next);
      if (decision === "like" && data.match) onChat(data.match.id);
    } catch (cause) {
      await exitAnimation.catch(() => undefined);
      if (!isCurrentDecision()) return;
      await springBack();
      if (!isCurrentDecision()) return;
      setError(cause instanceof Error ? cause.message : "Could not save that decision.");
    } finally {
      if (isCurrentDecision()) {
        decisionLocked.current = false;
        setBusy(false);
      }
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

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      busy ||
      decisionLocked.current ||
      !candidate ||
      drag.current ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, select, textarea")
    ) {
      return;
    }
    stopPanAnimations();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (
      !active ||
      active.pointerId !== event.pointerId ||
      !event.isPrimary ||
      busy
    ) {
      return;
    }
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      suppressPhotoTapUntil.current = Date.now() + 400;
      event.preventDefault();
    }
    panX.set(dx);
    panY.set(dy * 0.25);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (
      !active ||
      active.pointerId !== event.pointerId ||
      !event.isPrimary
    ) {
      return;
    }
    drag.current = null;
    if (busy || decisionLocked.current || !candidate) {
      return;
    }
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (Math.abs(dx) >= 120) {
      if (dx > 0 && candidate.browseOnly) {
        void springBack();
      } else {
        void decide(candidate.id, dx > 0 ? "like" : "pass");
      }
    } else {
      if (Math.abs(dy) > Math.abs(dx) && dy < -48) setShowDetails(true);
      void springBack();
    }
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (
      !active ||
      active.pointerId !== event.pointerId ||
      !event.isPrimary ||
      busy ||
      decisionLocked.current
    ) {
      return;
    }
    drag.current = null;
    void springBack();
  }

  useEffect(() => {
    panX.set(0);
    panY.set(0);
    setPhotoIndex(0);
    setShowDetails(true);
  }, [candidate?.id, panX, panY]);

  return (
    <section className="tiktok-feed discover-feed">
      <ErrorNote error={error} />
      {error && (
        <button className="text-button" onClick={load}>
          Try again
        </button>
      )}

      {!candidates && !error ? (
        <CardSkeleton count={1} className="discover-skeleton" />
      ) : candidate ? (
        <>
          <div
            className={`tiktok-stage discover-stage ${styles.dragStage}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onDragStart={(event) => event.preventDefault()}
          >
            {nextCandidate && (
              <div className={styles.peekCard} aria-hidden>
                <ProfileVisual
                  name={nextCandidate.name}
                  src={nextCandidate.photo}
                  className="discover-next-visual"
                />
              </div>
            )}
            <motion.div
              key={candidate.id}
              className={styles.dragCard}
              style={{ x: panX, y: panY, rotate: rotation }}
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
                      draggable={false}
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
                      <p className="discover-distance">
                        {distanceLabel(candidate.distanceMiles)}
                      </p>
                      {candidate.browseOnly && (
                        <p className={styles.browseOnlyNote}>
                          Browse only · outside your matching preferences
                        </p>
                      )}
                    </div>
                    <Safety
                      targetId={candidate.id}
                      targetName={candidate.name}
                      onDone={(completedAction) => {
                        if (completedAction === "block") {
                          setCandidates((previous) => {
                            const next =
                              previous?.filter((item) => item.id !== candidate.id) ??
                              [];
                            candidateCache.set(me.user.id, next);
                            return next;
                          });
                        }
                      }}
                    />
                  </div>
                  {candidate.bio && <p className="discover-bio">{candidate.bio}</p>}
                  <Evidence compatibility={candidate.compatibility} />
                </div>
              )}
              <motion.div
                className={`${styles.decisionLabel} ${styles.passLabel}`}
                style={{ opacity: passOpacity }}
                aria-hidden
              >
                PASS
              </motion.div>
              <motion.div
                className={`${styles.decisionLabel} ${styles.likeLabel}`}
                style={{ opacity: likeOpacity }}
                aria-hidden
              >
                LIKE
              </motion.div>
            </motion.div>
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
              disabled={busy || candidate.browseOnly}
              aria-label={
                candidate.browseOnly
                  ? "Matching unavailable for browse-only profile"
                  : "Match"
              }
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
        <CardSkeleton count={3} />
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

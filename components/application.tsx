"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  House,
  PlusCircle,
  Smiley,
  UserCircle,
  Users,
} from "@phosphor-icons/react";
import type { Candidate, Me } from "@/lib/contracts";
import {
  AuthScreen,
  MeScreen,
  ProfileForm,
  PublicProfileScreen,
} from "./account";
import { AdminScreen } from "./admin";
import { FeedScreen, SavedScreen } from "./memes";
import { NotificationsScreen, PostScreen } from "./social";
import { ChatsScreen, Conversation, DiscoverScreen } from "./people";
import { api, ErrorNote, Loading, RequestError } from "./ui";
import { SessionMatch } from "./session-match";

type View =
  | "memes"
  | "matches"
  | "post"
  | "notifications"
  | "chats"
  | "me"
  | "saved"
  | "admin";
type Route = {
  view: View;
  chat: string | null;
  profile: string | null;
  postId: string | null;
};
const views: View[] = [
  "memes",
  "matches",
  "post",
  "notifications",
  "chats",
  "me",
  "saved",
  "admin",
];
const destinations = [
  { view: "memes", label: "Home", icon: House },
  { view: "matches", label: "Discover", icon: Users },
  { view: "post", label: "Post", icon: PlusCircle },
  { view: "notifications", label: "Activity", icon: Bell },
  { view: "me", label: "Profile", icon: UserCircle },
] as const;
function triggerHaptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator)
    navigator.vibrate(10);
}

function readRoute(): Route {
  const query = new URLSearchParams(window.location.search);
  const view = query.get("view") as View | null;
  const chat = query.get("chat");
  const profile = query.get("profile");
  const postId = query.get("post");
  return {
    view: chat ? "chats" : view && views.includes(view) ? view : "memes",
    chat: chat || null,
    profile: view === "matches" && profile ? profile : null,
    postId: view === "memes" || !view ? postId || null : null,
  };
}

export default function Application() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({
    view: "memes",
    chat: null,
    profile: null,
    postId: null,
  });
  const request = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const positiveMemeIds = useRef(new Set<string>());
  const positiveCount = useRef(0);
  const sessionPopupShown = useRef(false);
  const sessionPopupGeneration = useRef(0);
  const authGeneration = useRef(0);
  const sessionMatchOpenRef = useRef(false);
  const candidateRequest = useRef(0);
  const [sessionCandidate, setSessionCandidate] = useState<Candidate | null>(
    null,
  );
  const [sessionCandidateLoading, setSessionCandidateLoading] = useState(false);
  const [sessionCandidateError, setSessionCandidateError] = useState<
    string | null
  >(null);
  const [sessionMatchOpen, setSessionMatchOpen] = useState(false);
  const [sessionOpenerMemeId, setSessionOpenerMemeId] = useState<string | null>(
    null,
  );
  const [sessionMatchUserId, setSessionMatchUserId] = useState<string | null>(
    null,
  );
  const authenticatedUserId = me?.user.id ?? null;
  const complete = Boolean(me?.profile?.complete);
  if (activeUserId.current !== authenticatedUserId) {
    activeUserId.current = authenticatedUserId;
    authGeneration.current += 1;
  }
  const currentAuthGeneration = authGeneration.current;
  sessionMatchOpenRef.current = sessionMatchOpen;
  const content = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<Me>("/api/profile");
      if (current === request.current) {
        setMe(result);
      }
    } catch (cause) {
      if (current !== request.current) return;
      if (cause instanceof RequestError && cause.status === 401) setMe(null);
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "Your session could not load. Please try again.",
        );
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => setRoute(readRoute());
    sync();
    void refresh();
    window.addEventListener("popstate", sync);
    return () => {
      ++request.current;
      window.removeEventListener("popstate", sync);
    };
  }, [refresh]);

  const navigate = useCallback(
    (
      view: View,
      chat: string | null = null,
      replace = false,
      profile: string | null = null,
      postId: string | null = null,
    ) => {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      if (chat) url.searchParams.set("chat", chat);
      else url.searchParams.delete("chat");
      if (profile) url.searchParams.set("profile", profile);
      else url.searchParams.delete("profile");
      if (postId) url.searchParams.set("post", postId);
      else url.searchParams.delete("post");
      if (replace) window.history.replaceState(null, "", url);
      else if (url.href !== window.location.href)
        window.history.pushState(null, "", url);
      setRoute({ view, chat, profile, postId });
    },
    [],
  );
  useEffect(() => {
    ++candidateRequest.current;
    positiveMemeIds.current.clear();
    positiveCount.current = 0;
    sessionPopupShown.current = false;
    setSessionOpenerMemeId(null);
    setSessionCandidate(null);
    setSessionCandidateLoading(false);
    setSessionCandidateError(null);
    setSessionMatchOpen(false);
    sessionPopupGeneration.current = 0;
    setSessionMatchUserId(null);
  }, [authenticatedUserId, currentAuthGeneration]);

  const loadSessionCandidate = useCallback(async () => {
    const userId = activeUserId.current;
    if (!userId || !complete) return;
    const current = ++candidateRequest.current;
    setSessionCandidateLoading(true);
    setSessionCandidateError(null);
    setSessionCandidate(null);
    try {
      const result = await api<{ candidates: Candidate[] }>("/api/candidates");
      if (
        current !== candidateRequest.current ||
        activeUserId.current !== userId
      )
        return;
      const candidate = result.candidates.find(
        (item) => item.id !== userId && !item.browseOnly,
      );
      setSessionCandidate(candidate ?? null);
    } catch (cause) {
      if (
        current !== candidateRequest.current ||
        activeUserId.current !== userId
      )
        return;
      setSessionCandidateError(
        cause instanceof Error
          ? cause.message
          : "Could not load a match suggestion.",
      );
    } finally {
      if (
        current === candidateRequest.current &&
        activeUserId.current === userId
      )
        setSessionCandidateLoading(false);
    }
  }, [complete]);

  useEffect(() => {
    if (authenticatedUserId && complete) void loadSessionCandidate();
  }, [authenticatedUserId, complete, loadSessionCandidate]);

  const onPositiveReaction = useCallback(
    (memeId: string) => {
      const userId = authenticatedUserId;
      const generation = currentAuthGeneration;
      if (
        !userId ||
        generation !== authGeneration.current ||
        userId !== activeUserId.current ||
        !complete ||
        sessionPopupShown.current ||
        positiveMemeIds.current.has(memeId)
      )
        return;
      positiveMemeIds.current.add(memeId);
      positiveCount.current += 1;
      if (positiveCount.current !== 5) return;
      sessionPopupShown.current = true;
      sessionPopupGeneration.current = generation;
      setSessionOpenerMemeId(memeId);
      setSessionMatchUserId(userId);
      setSessionMatchOpen(true);
      void loadSessionCandidate();
    },
    [authenticatedUserId, complete, currentAuthGeneration, loadSessionCandidate],
  );

  useEffect(() => {
    content.current?.scrollTo({ top: 0, behavior: "instant" });
    content.current?.focus({ preventScroll: true });
  }, [
    route.view,
    route.chat,
    route.profile,
    route.postId,
    authenticatedUserId,
    complete,
  ]);

  const openChat = (id: string) => navigate("chats", id);
  const active =
    route.view === "admin" || route.view === "saved" ? "me" : route.view;
  const activeIndex = destinations.findIndex(({ view }) => view === active);
  const inConversation =
    complete && route.view === "chats" && Boolean(route.chat);
  const immersiveFeed =
    complete &&
    !inConversation &&
    !route.profile &&
    (route.view === "memes" || route.view === "matches");
  const sessionMatchVisible =
    sessionMatchOpen &&
    complete &&
    sessionMatchUserId === authenticatedUserId &&
    sessionPopupGeneration.current === currentAuthGeneration;
  const handleSessionMatched = useCallback(
    (matchId: string) => {
      if (
        !sessionMatchOpenRef.current ||
        !sessionMatchUserId ||
        sessionMatchUserId !== activeUserId.current ||
        currentAuthGeneration !== authGeneration.current ||
        sessionPopupGeneration.current !== authGeneration.current ||
        !sessionPopupShown.current
      )
        return;
      setSessionMatchOpen(false);
      setSessionOpenerMemeId(null);
      navigate("chats", matchId);
    },
    [
      currentAuthGeneration,
      navigate,
      sessionMatchUserId,
    ],
  );

  return (
    <div className="app-canvas">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        className="desktop-note"
        aria-label="How Crackd works"
      >
        <span className="desktop-note-icon">
          <Smiley size={32} weight="bold" aria-hidden />
        </span>
        <p className="eyebrow">Less small talk. More shared nonsense.</p>
        <h2>A better opening line starts with a worse meme.</h2>
        <ol>
          <li>
            <span>01</span>Judge a few memes.
          </li>
          <li>
            <span>02</span>Find your kind of weird.
          </li>
          <li>
            <span>03</span>Laugh at life together.
          </li>
        </ol>
      </aside>
      <div
        className={`product-surface ${complete ? "signed-in" : "welcome-surface"} ${inConversation ? "conversation-surface" : ""}`}
      >
        {(loading || error || me) && !inConversation && !immersiveFeed && (
          <header className="app-header">
            <div className="brand">
              <img className="brand-logo" src="/crackd-mark.png" alt="" />
              <span className="brand-name">crackd</span>
            </div>
          </header>
        )}
        <main
          id="main-content"
          ref={content}
          tabIndex={-1}
          className={`screen-content ${!me && !loading && !error ? "auth-content" : ""} ${inConversation ? "chat-screen-content" : ""} ${immersiveFeed ? "immersive-content" : ""}`}
        >
          {loading ? (
            <div className="session-loading">
              <p className="eyebrow">Finding your place</p>
              <h1>Good to see you.</h1>
              <Loading rows={3} />
            </div>
          ) : error ? (
            <section className="session-error">
              <h1>A small interruption.</h1>
              <p>Your place is still here. We couldn’t load your account.</p>
              <ErrorNote error={error} />
              <button
                className="button primary full"
                onClick={() => void refresh()}
              >
                Try again <ArrowRight size={20} />
              </button>
            </section>
          ) : !me ? (
            <AuthScreen onDone={() => void refresh()} />
          ) : !complete ? (
            <ProfileForm
              me={me}
              onSaved={() => {
                navigate("memes", null, true);
                void refresh();
              }}
            />
          ) : route.view === "saved" ? (
            <SavedScreen
              onViewProfile={(id) => navigate("matches", null, false, id)}
            />
          ) : route.view === "admin" ? (
            <AdminScreen onBack={() => navigate("me")} />
          ) : route.view === "post" ? (
            <PostScreen onDone={() => navigate("memes")} />
          ) : route.view === "notifications" ? (
            <NotificationsScreen
              onChat={openChat}
              onDiscover={() => navigate("matches")}
            />
          ) : route.view === "matches" ? (
            route.profile ? (
              <PublicProfileScreen
                profileId={route.profile}
                onMatched={(matchId) => openChat(matchId)}
                onBack={() => navigate("matches")}
              />
            ) : (
              <DiscoverScreen
                me={me}
                onChat={openChat}
                onMemes={() => navigate("memes")}
                onProfile={() => navigate("me")}
                onViewProfile={(id) => navigate("matches", null, false, id)}
              />
            )
          ) : route.view === "chats" ? (
            route.chat ? (
              <Conversation
                id={route.chat}
                me={me}
                onBack={() => navigate("chats")}
              />
            ) : (
              <ChatsScreen
                onChat={openChat}
                onDiscover={() => navigate("matches")}
              />
            )
          ) : route.view === "me" ? (
            <MeScreen
              me={me}
              onRefresh={() => void refresh()}
              onSavedPosts={() => navigate("saved")}
              onSignedOut={() => {
                setMe(null);
                navigate("memes", null, true);
              }}
            />
          ) : (
            <FeedScreen
              postId={route.postId ?? undefined}
              onViewProfile={(id) => navigate("matches", null, false, id)}
              onPositiveReaction={onPositiveReaction}
            />
          )}
        </main>
        {sessionMatchVisible && (
          <SessionMatch
            candidate={sessionCandidate}
            openerMemeId={sessionOpenerMemeId}
            loading={sessionCandidateLoading}
            error={sessionCandidateError}
            onRetry={() => void loadSessionCandidate()}
            onClose={() => {
              setSessionMatchOpen(false);
              setSessionOpenerMemeId(null);
            }}
            onMatched={handleSessionMatched}
          />
        )}
        {complete && !loading && !error && !inConversation && (
          <nav className="bottom-nav" aria-label="Main navigation">
            <span
              className="nav-slider"
              aria-hidden
              style={{ transform: `translateX(${activeIndex * 100}%)` }}
            />
            {destinations.map(({ view, label, icon: Icon }) => (
              <button
                key={view}
                className={active === view ? "nav-item active" : "nav-item"}
                aria-current={active === view ? "page" : undefined}
                onClick={() => {
                  triggerHaptic();
                  navigate(view);
                }}
              >
                <Icon
                  size={25}
                  weight={active === view ? "fill" : "regular"}
                  aria-hidden
                />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

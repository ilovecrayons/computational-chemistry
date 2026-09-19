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
import type { Me } from "@/lib/contracts";
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

type View =
  | "memes"
  | "matches"
  | "post"
  | "notifications"
  | "chats"
  | "me"
  | "saved"
  | "admin";
type Route = { view: View; chat: string | null; profile: string | null };
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
  return {
    view: chat ? "chats" : view && views.includes(view) ? view : "memes",
    chat: chat || null,
    profile: view === "matches" && profile ? profile : null,
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
  });
  const request = useRef(0);
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
    ) => {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      if (chat) url.searchParams.set("chat", chat);
      else url.searchParams.delete("chat");
      if (profile) url.searchParams.set("profile", profile);
      else url.searchParams.delete("profile");
      if (replace) window.history.replaceState(null, "", url);
      else if (url.href !== window.location.href)
        window.history.pushState(null, "", url);
      setRoute({ view, chat, profile });
    },
    [],
  );

  useEffect(() => {
    content.current?.scrollTo({ top: 0, behavior: "instant" });
    content.current?.focus({ preventScroll: true });
  }, [
    route.view,
    route.chat,
    route.profile,
    me?.user.id,
    me?.profile?.complete,
  ]);

  const openChat = (id: string) => navigate("chats", id);
  const complete = Boolean(me?.profile?.complete);
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
                onBack={() => navigate("matches")}
                onMatched={() => navigate("chats")}
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
              onViewProfile={(id) => navigate("matches", null, false, id)}
            />
          )}
        </main>
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChatCircle,
  Heart,
  Smiley,
  UserCircle,
  Users,
} from "@phosphor-icons/react";
import type { Me } from "@/lib/contracts";
import { AuthScreen, MeScreen, ProfileForm } from "./account";
import { AdminScreen } from "./admin";
import { FeedScreen, TasteScreen } from "./memes";
import { ChatsScreen, Conversation, DiscoverScreen } from "./people";
import { api, ErrorNote, Loading, RequestError } from "./ui";

type View = "memes" | "matches" | "chats" | "me" | "taste" | "admin";
type Route = { view: View; chat: string | null };
const views: View[] = ["memes", "matches", "chats", "me", "taste", "admin"];
const destinations = [
  { view: "memes", label: "Memes", icon: Smiley },
  { view: "matches", label: "Discover", icon: Users },
  { view: "chats", label: "Chats", icon: ChatCircle },
  { view: "me", label: "Me", icon: UserCircle },
] as const;

function readRoute(): Route {
  const query = new URLSearchParams(window.location.search);
  const view = query.get("view") as View | null;
  const chat = query.get("chat");
  return {
    view: chat ? "chats" : view && views.includes(view) ? view : "memes",
    chat: chat || null,
  };
}

export default function Application() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [route, setRoute] = useState<Route>({ view: "memes", chat: null });
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
        setRevision((value) => value + 1);
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
    (view: View, chat: string | null = null, replace = false) => {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      if (chat) url.searchParams.set("chat", chat);
      else url.searchParams.delete("chat");
      if (replace) window.history.replaceState(null, "", url);
      else if (url.href !== window.location.href)
        window.history.pushState(null, "", url);
      setRoute({ view, chat });
    },
    [],
  );

  useEffect(() => {
    content.current?.scrollTo({ top: 0, behavior: "instant" });
    content.current?.focus({ preventScroll: true });
  }, [route.view, route.chat, me?.user.id, me?.profile?.complete]);

  const openChat = (id: string) => navigate("chats", id);
  const complete = Boolean(me?.profile?.complete);
  const active =
    route.view === "taste"
      ? "memes"
      : route.view === "admin"
        ? "me"
        : route.view;
  const inConversation =
    complete && route.view === "chats" && Boolean(route.chat);
  const immersiveFeed =
    complete &&
    !inConversation &&
    (route.view === "memes" || route.view === "matches");

  return (
    <div className="app-canvas">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        className="desktop-note"
        aria-label="How Computational Chemistry works"
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
        <p className="desktop-disclaimer">
          A little prototype for a very human idea.
          <br />
          Humor is a starting point. You do the rest.
        </p>
      </aside>
      <div
        className={`product-surface ${complete ? "signed-in" : "welcome-surface"} ${inConversation ? "conversation-surface" : ""}`}
      >
        {(loading || error || me) && !inConversation && !immersiveFeed && (
          <header className="app-header">
            <div className="brand">
              <Heart size={22} weight="fill" aria-hidden />
              <span className="brand-name">
                Computational Chemistry<span className="brand-dot">.</span>
              </span>
            </div>
            <span className="prototype-label">18+ prototype</span>
          </header>
        )}
        <main
          id="main-content"
          ref={content}
          tabIndex={-1}
          className={`screen-content ${!me && !loading && !error ? "auth-content" : ""} ${inConversation ? "chat-screen-content" : ""} ${immersiveFeed ? "immersive-content" : ""}`}
          key={`${me?.user.id || "guest"}:${revision}:${route.view}:${route.chat || ""}`}
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
          ) : route.view === "taste" ? (
            <TasteScreen
              onMatches={() => navigate("matches")}
              onMemes={() => navigate("memes")}
            />
          ) : route.view === "admin" ? (
            <AdminScreen onBack={() => navigate("me")} />
          ) : route.view === "matches" ? (
            <DiscoverScreen
              me={me}
              onChat={openChat}
              onMemes={() => navigate("memes")}
            />
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
              onSignedOut={() => {
                setMe(null);
                navigate("memes", null, true);
              }}
              onTaste={() => navigate("taste")}
              onAdmin={() => navigate("admin")}
            />
          ) : (
            <FeedScreen onTaste={() => navigate("taste")} />
          )}
        </main>
        {complete && !loading && !error && !inConversation && (
          <nav className="bottom-nav" aria-label="Main navigation">
            {destinations.map(({ view, label, icon: Icon }) => (
              <button
                key={view}
                className={active === view ? "nav-item active" : "nav-item"}
                aria-current={active === view ? "page" : undefined}
                onClick={() => navigate(view)}
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

"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, Bell, ChatCircle, Heart, UploadSimple } from "@phosphor-icons/react";
import type { AppNotification, Match } from "@/lib/contracts";
import {
  api,
  CardSkeleton,
  ErrorNote,
  Loading,
  ProfileVisual,
  SectionTitle,
} from "./ui";

function uploadError(data: unknown) {
  if (data && typeof data === "object" && "error" in data) {
    const error = data.error;
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    )
      return error.message;
  }
  return "That post could not be posted.";
}
export function PostScreen({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : "");
    setError(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("media", file);
      body.set("caption", caption);
      const response = await fetch("/api/posts", { method: "POST", body });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(uploadError(data));
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That post could not be posted.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="post-screen">
      <SectionTitle title="Share a meme." />
      <p className="supporting">Share a photo or short video. Under 50 MB.</p>
      <form className="stack" onSubmit={submit}>
        <label className="media-upload-card">
          <UploadSimple size={28} weight="bold" aria-hidden />
          <strong>{file ? file.name : "Choose from camera roll"}</strong>
          <span>{file ? "Tap to replace it" : "Photos or short videos"}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            capture="environment"
            onChange={chooseFile}
          />
        </label>
        {preview &&
          (file?.type.startsWith("video/") ? (
            <video className="post-preview" src={preview} controls muted playsInline />
          ) : (
            <img className="post-preview" src={preview} alt="Post preview" />
          ))}
        <label>
          Caption <span className="label-note">Optional</span>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={220}
            rows={3}
            placeholder="Add a caption..."
          />
        </label>
        <ErrorNote error={error} />
        <button className="button primary full" disabled={!file || busy}>
          {busy ? "Posting…" : "Post"} <ArrowRight size={20} />
        </button>
      </form>
    </section>
  );
}

export function NotificationsScreen({
  onChat,
  onDiscover,
}: {
  onChat: (id: string) => void;
  onDiscover: () => void;
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      api<{ notifications: AppNotification[] }>("/api/notifications"),
      api<{ matches: Match[] }>("/api/matches"),
    ])
      .then(([activity, matchData]) => {
        setNotifications(activity.notifications);
        setMatches(matchData.matches);
        void api("/api/notifications/read", {});
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load activity."))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="notifications-screen">
      <SectionTitle eyebrow="Stay in the loop" title="Notifications." />
      <ErrorNote error={error} />
      {loading ? (
        <CardSkeleton count={3} />
      ) : (
        <>
          <section className="notification-group">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Priority</p>
                <h2>Chats</h2>
              </div>
              <ChatCircle size={24} weight="duotone" aria-hidden />
            </div>
            {matches.length ? (
              matches.map((match) => (
                <button className="notification-chat" key={match.id} onClick={() => onChat(match.id)}>
                  <ProfileVisual name={match.profile.name} src={match.profile.photo} className="notification-avatar" />
                  <span>
                    <strong>{match.profile.name}</strong>
                    <small>{match.lastMessage || "You matched. Say something."}</small>
                  </span>
                  <ArrowRight size={18} aria-hidden />
                </button>
              ))
            ) : (
              <div className="empty-inline">
                <p>No chats yet.</p>
                <button className="text-button" onClick={onDiscover}>Find your people <ArrowRight size={18} /></button>
              </div>
            )}
          </section>
          <section className="notification-group">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">New connections</p>
                <h2>Matches</h2>
              </div>
              <Heart size={24} weight="duotone" aria-hidden />
            </div>
            {matches.length ? (
              <div className="match-strip">
                {matches.map((match) => (
                  <button className="match-chip" key={match.id} onClick={() => onChat(match.id)}>
                    <ProfileVisual name={match.profile.name} src={match.profile.photo} className="notification-avatar" />
                    <span>{match.profile.name}</span>
                  </button>
                ))}
              </div>
            ) : <p className="supporting">Likes become matches when the feeling is mutual.</p>}
          </section>
          <section className="notification-group">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Your activity</p>
                <h2>Likes and comments</h2>
              </div>
              <Bell size={24} weight="duotone" aria-hidden />
            </div>
            {notifications.length ? notifications.map((item) => (
              <article className={`activity-row ${item.readAt ? "" : "unread"}`} key={item.id}>
                <div className="activity-icon"><Bell size={19} weight="fill" aria-hidden /></div>
                <p><strong>{item.actor?.name || "Someone"}</strong> {item.message}</p>
              </article>
            )) : <p className="supporting">Your likes and comments will appear here.</p>}
          </section>
        </>
      )}
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Heart,
  SignOut,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import type { Gender, Intent, Me, Profile, Tasteprint } from "@/lib/contracts";
import { TONES } from "@/features/memes/taxonomy";
import { api, Dialog, ErrorNote, RequestError, SectionTitle, Tags } from "./ui";

const genders: Gender[] = ["woman", "man", "nonbinary"];
const demoPassword = "Memeant-demo-2026!";
export function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"welcome" | "signin" | "signup">("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    api<{ personas: unknown[] }>("/api/demo/personas")
      .then(() => setDemo(true))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (mode !== "welcome") heading.current?.focus();
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const data = new FormData(event.currentTarget);
    if (mode === "signup" && data.get("adult") !== "on") {
      setError("You must be 18 or older to join.");
      return;
    }
    setBusy(true);
    try {
      await api(
        `/api/auth/${mode === "signup" ? "sign-up" : "sign-in"}/email`,
        {
          email: data.get("email"),
          password: data.get("password"),
          ...(mode === "signup" ? { name: data.get("name") } : {}),
        },
      );
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  async function enterDemo() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/sign-in/email", {
        email: "alex@demo.local",
        password: demoPassword,
      });
      onDone();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`auth-screen ${mode === "welcome" ? "" : "auth-form"}`}>
      <div className="brand">
        <Heart size={28} weight="fill" aria-hidden />
        <span className="brand-name">
          Computational Chemistry<span className="brand-dot">.</span>
        </span>
      </div>
      <div className="welcome-art" aria-hidden>
        <span className="art-note note-one">good taste?</span>
        <div className="laugh-face">
          <span>×</span>
          <span>×</span>
          <div />
        </div>
        <span className="art-note note-two">debatable.</span>
      </div>
      <p className="eyebrow">A dating prototype with a sense of humor</p>
      <h1>
        Your sense of humor.
        <br />
        <span>A dating criterion.</span>
      </h1>
      <p className="welcome-copy">
        Rate a few terrible memes. Find someone who laughs at the same garbage.
      </p>
      {mode === "welcome" ? (
        <div className="stack">
          <button
            className="button primary"
            disabled={busy}
            onClick={() => setMode("signup")}
          >
            Judge memes <ArrowRight size={20} />
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setMode("signin")}
          >
            I have an account
          </button>
          {demo && (
            <button className="text-button" disabled={busy} onClick={enterDemo}>
              {busy ? "Opening demo…" : "Try the fictional demo"}
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="stack" aria-busy={busy}>
          <div className="form-heading">
            <h2 ref={heading} tabIndex={-1}>
              {mode === "signup"
                ? "Let’s start with you."
                : "Back for more nonsense?"}
            </h2>
            <span>{mode === "signup" ? "1 of 3" : "Welcome back"}</span>
          </div>
          {mode === "signup" && (
            <label>
              Your name
              <input
                name="name"
                autoComplete="given-name"
                required
                minLength={2}
                maxLength={40}
              />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={mode === "signup" ? 10 : undefined}
              maxLength={128}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              aria-describedby={mode === "signup" ? "password-help" : undefined}
              required
            />
            {mode === "signup" && (
              <span className="supporting" id="password-help">
                At least 10 characters.
              </span>
            )}
          </label>
          {mode === "signup" && (
            <label className="check-row">
              <input type="checkbox" name="adult" required />I am at least 18
              years old.
            </label>
          )}
          <ErrorNote error={error} />
          <button className="button primary" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
            <ArrowRight size={20} />
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
            }}
          >
            {mode === "signup"
              ? "Already have an account?"
              : "Create an account instead"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setMode("welcome");
              setError(null);
            }}
          >
            Back to welcome
          </button>
        </form>
      )}
      {mode === "welcome" && <ErrorNote error={error} />}
      <p className="fine-print">
        18+ only. Compatibility is a conversation starter, not a scientific
        prediction.
      </p>
    </section>
  );
}

function initialProfile(me: Me): Profile {
  return (
    me.profile || {
      id: me.user.id,
      name: me.user.name,
      dob: "",
      bio: "",
      location: "",
      gender: "nonbinary",
      photo: "/demo/person-1.svg",
      intent: "relationship",
      preferences: { genders: [...genders], minAge: 18, maxAge: 45 },
      initialTags: [],
      complete: false,
    }
  );
}
export function ProfileForm({
  me,
  onSaved,
  editing = false,
}: {
  me: Me;
  onSaved: () => void;
  editing?: boolean;
}) {
  const [profile, setProfile] = useState<Profile>(() => initialProfile(me));
  const [step, setStep] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const section = useRef<HTMLElement>(null);
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile((previous) => ({ ...previous, [key]: value }));
  useEffect(() => {
    section.current?.scrollIntoView({ block: "start" });
    section.current?.focus({ preventScroll: true });
  }, [step]);
  function validateBasics() {
    const errors: Record<string, string> = {};
    const date = new Date(`${profile.dob}T00:00:00Z`);
    const today = new Date();
    const age =
      today.getUTCFullYear() -
      date.getUTCFullYear() -
      (today.getUTCMonth() < date.getUTCMonth() ||
      (today.getUTCMonth() === date.getUTCMonth() &&
        today.getUTCDate() < date.getUTCDate())
        ? 1
        : 0);
    if (
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== profile.dob ||
      age < 18 ||
      age > 100
    )
      errors.dob = "You must be at least 18. Enter a valid date of birth.";
    if (profile.name.trim().length < 2)
      errors.name = "Enter at least two characters.";
    if (profile.bio.trim().length < 8)
      errors.bio = "Tell people a little about yourself.";
    if (
      profile.location.trim().length < 2 ||
      !/^[\p{L}\p{M}\s.,'’()-]+$/u.test(profile.location)
    )
      errors.location = "Enter a city or broad area, not an address.";
    if (!profile.preferences.genders.length)
      errors.preferences = "Select at least one gender you would like to meet.";
    if (profile.preferences.minAge > profile.preferences.maxAge)
      errors.preferences = "Minimum age cannot exceed maximum age.";
    setFields(errors);
    return !Object.keys(errors).length;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!validateBasics()) {
      setStep(2);
      setError("Check the highlighted fields.");
      requestAnimationFrame(() =>
        section.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    if (step === 2 && !editing) {
      setStep(3);
      return;
    }
    if (profile.initialTags.length !== 3) {
      setFields({ initialTags: "Choose exactly three starting humor tags." });
      return;
    }
    setBusy(true);
    try {
      await api("/api/profile", profile);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof RequestError && cause.fields) {
        const errors: Record<string, string> = {};
        for (const [key, message] of Object.entries(cause.fields))
          errors[key.split(".")[0]] ??= message;
        setFields(errors);
        if (Object.keys(errors).some((key) => key !== "initialTags"))
          setStep(2);
      }
    } finally {
      setBusy(false);
    }
  }
  const fieldError = (key: string) =>
    fields[key] ? (
      <span className="field-error" id={`profile-error-${key}`} role="alert">
        {fields[key]}
      </span>
    ) : null;
  const tagPicker = (
    <fieldset
      aria-describedby={`tag-help${fields.initialTags ? " profile-error-initialTags" : ""}`}
    >
      <legend>Three starting humor tags</legend>
      <p className="supporting" id="tag-help">
        Just a starting point. Your actual reactions replace these assumptions.
      </p>
      <div className="choice-grid">
        {TONES.map((tone) => (
          <button
            type="button"
            key={tone}
            className={`choice ${profile.initialTags.includes(tone) ? "selected" : ""}`}
            aria-pressed={profile.initialTags.includes(tone)}
            disabled={
              busy ||
              (profile.initialTags.length === 3 &&
                !profile.initialTags.includes(tone))
            }
            onClick={() =>
              set(
                "initialTags",
                profile.initialTags.includes(tone)
                  ? profile.initialTags.filter((tag) => tag !== tone)
                  : [...profile.initialTags, tone],
              )
            }
          >
            {tone}
          </button>
        ))}
      </div>
      <p className="supporting" aria-live="polite">
        {profile.initialTags.length} of 3 selected. Tap a selected tag to change
        it.
      </p>
      {fieldError("initialTags")}
    </fieldset>
  );
  return (
    <section className="profile-form" ref={section} tabIndex={-1}>
      <SectionTitle
        eyebrow={
          editing
            ? "Public profile & private preferences"
            : `${step} of 3 · A little context`
        }
        title={
          step === 3
            ? "What gets you?"
            : editing
              ? "Make it you."
              : "A person, not a profile."
        }
      />
      <form className="stack" onSubmit={submit} aria-busy={busy}>
        {(step === 2 || editing) && (
          <>
            <label>
              Display name
              <input
                value={profile.name}
                onChange={(event) => set("name", event.target.value)}
                autoComplete="given-name"
                required
                minLength={2}
                maxLength={40}
                aria-invalid={Boolean(fields.name)}
                aria-describedby={
                  fields.name ? "profile-error-name" : undefined
                }
              />
              {fieldError("name")}
            </label>
            <label>
              Date of birth{" "}
              <span className="label-note" id="dob-help">
                Private. Only your age is shown.
              </span>
              <input
                type="date"
                value={profile.dob}
                onChange={(event) => set("dob", event.target.value)}
                autoComplete="bday"
                required
                aria-invalid={Boolean(fields.dob)}
                aria-describedby={`dob-help${fields.dob ? " profile-error-dob" : ""}`}
              />
              {fieldError("dob")}
            </label>
            <label>
              Broad location
              <input
                value={profile.location}
                onChange={(event) => set("location", event.target.value)}
                placeholder="e.g. Brooklyn"
                autoComplete="address-level2"
                required
                minLength={2}
                maxLength={60}
                aria-invalid={Boolean(fields.location)}
                aria-describedby={
                  fields.location ? "profile-error-location" : undefined
                }
              />
              {fieldError("location")}
            </label>
            <label>
              One thing about you
              <textarea
                value={profile.bio}
                onChange={(event) => set("bio", event.target.value)}
                placeholder="My love language is sending you a meme with no context."
                required
                minLength={8}
                maxLength={400}
                rows={3}
                aria-invalid={Boolean(fields.bio)}
                aria-describedby={fields.bio ? "profile-error-bio" : undefined}
              />
              {fieldError("bio")}
            </label>
            <label>
              Gender
              <select
                value={profile.gender}
                onChange={(event) =>
                  set("gender", event.target.value as Gender)
                }
              >
                {genders.map((gender) => (
                  <option key={gender}>{gender}</option>
                ))}
              </select>
              {fieldError("gender")}
            </label>
            <label>
              Looking for
              <select
                value={profile.intent}
                onChange={(event) =>
                  set("intent", event.target.value as Intent)
                }
              >
                <option value="relationship">A relationship</option>
                <option value="casual">Something casual</option>
                <option value="figuring-it-out">Figuring it out</option>
              </select>
              {fieldError("intent")}
            </label>
            <fieldset
              aria-describedby={
                fields.preferences ? "profile-error-preferences" : undefined
              }
            >
              <legend>
                Meet people who are <span className="label-note">Private</span>
              </legend>
              <div className="choice-grid">
                {genders.map((gender) => (
                  <button
                    type="button"
                    key={gender}
                    className={`choice ${profile.preferences.genders.includes(gender) ? "selected" : ""}`}
                    aria-pressed={profile.preferences.genders.includes(gender)}
                    onClick={() =>
                      set("preferences", {
                        ...profile.preferences,
                        genders: profile.preferences.genders.includes(gender)
                          ? profile.preferences.genders.filter(
                              (value) => value !== gender,
                            )
                          : [...profile.preferences.genders, gender],
                      })
                    }
                  >
                    {gender}
                  </button>
                ))}
              </div>
              <div className="two-columns">
                <label>
                  Minimum age
                  <input
                    type="number"
                    min={18}
                    max={100}
                    value={profile.preferences.minAge}
                    onChange={(event) =>
                      set("preferences", {
                        ...profile.preferences,
                        minAge: Number(event.target.value),
                      })
                    }
                    required
                  />
                </label>
                <label>
                  Maximum age
                  <input
                    type="number"
                    min={18}
                    max={100}
                    value={profile.preferences.maxAge}
                    onChange={(event) =>
                      set("preferences", {
                        ...profile.preferences,
                        maxAge: Number(event.target.value),
                      })
                    }
                    required
                  />
                </label>
              </div>
              {fieldError("preferences")}
            </fieldset>
            <fieldset>
              <legend>Choose your illustrated profile photo</legend>
              <p className="supporting">
                Local illustrations for this prototype.
              </p>
              <div className="photo-picker">
                {Array.from(
                  { length: 10 },
                  (_, index) => `/demo/person-${index + 1}.svg`,
                ).map((photo, index) => (
                  <button
                    type="button"
                    className={profile.photo === photo ? "selected" : ""}
                    aria-label={`Choose portrait ${index + 1}`}
                    aria-pressed={profile.photo === photo}
                    key={photo}
                    onClick={() => set("photo", photo)}
                  >
                    <img src={photo} alt="" />
                  </button>
                ))}
              </div>
              {fieldError("photo")}
            </fieldset>
          </>
        )}
        {(step === 3 || editing) && tagPicker}
        <ErrorNote error={error} />
        <button className="button primary" disabled={busy}>
          {busy
            ? "Saving…"
            : editing
              ? "Save profile"
              : step === 2
                ? "Next: your humor"
                : "Judge memes"}
          <ArrowRight size={20} />
        </button>
        {step === 3 && !editing && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => setStep(2)}
          >
            Back to profile
          </button>
        )}
      </form>
    </section>
  );
}

export function MeScreen({
  me,
  onRefresh,
  onSignedOut,
  onTaste,
  onAdmin,
}: {
  me: Me;
  onRefresh: () => void;
  onSignedOut: () => void;
  onTaste: () => void;
  onAdmin: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [taste, setTaste] = useState<Tasteprint | null>(null);
  const [personas, setPersonas] = useState<
    { id: string; name: string; email: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Tasteprint>("/api/tasteprint")
      .then(setTaste)
      .catch((e) => setError(e.message));
    if (me.demoMode)
      api<{ personas: typeof personas }>("/api/demo/personas")
        .then((r) => setPersonas(r.personas))
        .catch((e) => setError(e.message));
  }, [me.demoMode]);
  async function signOut() {
    setBusy(true);
    try {
      await api("/api/auth/sign-out", {});
      onSignedOut();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function switchPersona(email: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/sign-out", {});
      await api("/api/auth/sign-in/email", { email, password: demoPassword });
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
      onSignedOut();
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      await api("/api/admin/demo-reset", {});
      setConfirmReset(false);
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (editing)
    return (
      <>
        <button className="text-button" onClick={() => setEditing(false)}>
          Back to me
        </button>
        <ProfileForm
          me={me}
          editing
          onSaved={() => {
            setEditing(false);
            onRefresh();
          }}
        />
      </>
    );
  return (
    <>
      <SectionTitle
        eyebrow="A little less mysterious"
        title="Me, unfortunately."
      />
      <div className="profile-summary">
        <img
          className="profile-avatar"
          src={me.profile!.photo}
          alt={`${me.profile!.name}'s illustrated portrait`}
        />
        <div>
          <h2>{me.profile!.name}</h2>
          <p>{me.profile!.location}</p>
        </div>
      </div>
      <p className="bio">{me.profile!.bio}</p>
      <button
        className="button secondary full"
        onClick={() => setEditing(true)}
      >
        Edit profile
      </button>
      <section className="settings-section">
        <h2>Your sense of humor</h2>
        <p>{taste?.summary || "Every LOL tells us something."}</p>
        <Tags tags={taste?.tags.map((t) => t.tag) || []} />
        <button className="text-button" onClick={onTaste}>
          View tasteprint <ArrowRight size={18} />
        </button>
        <p className="supporting">
          Built from {taste?.reactionCount ?? 0} reactions.
        </p>
      </section>
      <section className="settings-section">
        <h2>Your account</h2>
        <p>{me.user.email}</p>
        <p className="supporting">
          Your date of birth and preferences stay private. Block, report, and
          unmatch controls are available on people and chats.
        </p>
        <button className="text-button" disabled={busy} onClick={signOut}>
          <SignOut size={20} />
          Sign out
        </button>
      </section>
      {me.demoMode && (
        <section className="settings-section demo-panel">
          <p className="eyebrow">Demo controls · fictional adults</p>
          <label>
            Switch persona
            <select
              value={me.user.email}
              disabled={busy}
              onChange={(e) => void switchPersona(e.target.value)}
            >
              {personas.map((p) => (
                <option key={p.id} value={p.email}>
                  {p.name}
                  {p.id === "demo-alex" ? " · fresh start" : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="text-button" onClick={onAdmin}>
            Open media studio <ArrowRight size={18} />
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setConfirmReset(true)}
          >
            <ArrowCounterClockwise size={20} />
            Reset demo
          </button>
          <p className="supporting">
            Local illustrated demo media. Generate xAI media separately in the
            studio.
          </p>
        </section>
      )}
      <ErrorNote error={error} />
      <p className="fine-print">
        Computational Chemistry is a prototype, not a production dating service.
        The Latent LOL Compatibility Engine ranks shared humor, not your future.
      </p>
      {confirmReset && (
        <Dialog title="Reset the demo?" onClose={() => setConfirmReset(false)}>
          <p>
            This restores fictional profiles, reactions, matches, and messages.
            Existing accounts remain. Your saved media library is not deleted or
            regenerated.
          </p>
          <ErrorNote error={error} />
          <button
            className="button danger full"
            disabled={busy}
            onClick={reset}
          >
            {busy ? "Resetting…" : "Reset demo"}
          </button>
          <button
            className="button secondary full"
            onClick={() => setConfirmReset(false)}
          >
            Keep my progress
          </button>
        </Dialog>
      )}
    </>
  );
}

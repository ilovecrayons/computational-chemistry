"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Heart,
  SignOut,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import type { Gender, Intent, Me, Profile, Tasteprint } from "@/lib/contracts";
import { ageOn } from "@/features/profile/profile";

import { TONES } from "@/features/memes/taxonomy";
import { api, Dialog, ErrorNote, RequestError, SectionTitle, Tags } from "./ui";

const genders: Gender[] = ["woman", "man", "nonbinary"];
const demoPassword = "Memeant-demo-2026!";
const SIGNUP_DOB_KEY = "computational-chemistry-signup-dob";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function latestAdultBirthDate(): string {
  const today = new Date();
  return new Date(
    Date.UTC(
      today.getUTCFullYear() - 18,
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  )
    .toISOString()
    .slice(0, 10);
}

function readSignupDob(): string {
  if (typeof sessionStorage === "undefined") return "";
  const value = sessionStorage.getItem(SIGNUP_DOB_KEY);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function signupNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  const cleaned = local.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (cleaned.length >= 2) return cleaned.slice(0, 40);
  return "New member";
}

function validateSignupForm(data: FormData): string | null {
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  const dob = String(data.get("dob") ?? "");

  if (!emailPattern.test(email)) return "Enter a valid email address.";
  if (password.length < 10) return "Password must be at least 10 characters.";

  const date = new Date(`${dob}T00:00:00Z`);
  if (
    !dob ||
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== dob
  )
    return "Enter a valid date of birth.";
  if (ageOn(dob) < 18) return "You must be at least 18 to join.";
  if (ageOn(dob) > 100) return "Enter a valid date of birth.";
  return null;
}

function validateSigninForm(data: FormData): string | null {
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  if (!emailPattern.test(email)) return "Enter a valid email address.";
  if (!password) return "Enter your password.";
  return null;
}

export function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"welcome" | "signin" | "signup">("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (mode !== "welcome") heading.current?.focus();
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const clientError =
      mode === "signup"
        ? validateSignupForm(data)
        : validateSigninForm(data);
    if (clientError) {
      setError(clientError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api(
        `/api/auth/${mode === "signup" ? "sign-up" : "sign-in"}/email`,
        {
          email: data.get("email"),
          password: data.get("password"),
          ...(mode === "signup" ? { name: signupNameFromEmail(String(data.get("email"))) } : {}),
        },
      );
      if (mode === "signup")
        sessionStorage.setItem(SIGNUP_DOB_KEY, String(data.get("dob")));
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
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
        </div>
      ) : (
        <form onSubmit={submit} className="stack" noValidate aria-busy={busy}>
          <div className="form-heading">
            <h2 ref={heading} tabIndex={-1}>
              {mode === "signup"
                ? "Let’s start with you."
                : "Back for more nonsense?"}
            </h2>
            <span>{mode === "signup" ? "1 of 3" : "Welcome back"}</span>
          </div>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" />
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
            />
            {mode === "signup" && (
              <span className="supporting" id="password-help">
                At least 10 characters.
              </span>
            )}
          </label>
          {mode === "signup" && (
            <label>
              Date of birth{" "}
              <span className="label-note" id="signup-dob-help">
                Private. You must be at least 18.
              </span>
              <input
                type="date"
                name="dob"
                autoComplete="bday"
                max={latestAdultBirthDate()}
                aria-describedby="signup-dob-help"
              />
            </label>
          )}
          <ErrorNote error={error} />
          <button className="button primary" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "signup"
                ? "Next"
                : "Sign in"}
            <ArrowRight size={20} />
          </button>
          {mode === "signin" && (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
            >
              Create an account instead
            </button>
          )}
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

const radiusOptions = [5, 10, 25, 50, 100] as const;
const intentLabels: Record<Intent, string> = {
  relationship: "A relationship",
  casual: "Something casual",
  "figuring-it-out": "Figuring it out",
};

function initialProfile(me: Me): Profile {
  const signupDob = readSignupDob();
  return (
    me.profile || {
      id: me.user.id,
      name: me.user.name,
      dob: signupDob,
      bio: "",
      town: "",
      matchLocation: "",
      location: "",
      gender: "woman",
      photo: "",
      photos: [],
      favoriteMemes: [],
      interests: [],
      intent: "relationship",
      preferences: { genders: [], minAge: 18, maxAge: 45, radiusMiles: 25 },
      initialTags: [],
      complete: false,
    }
  );
}

function readPhotos(files: FileList | null): Promise<string[]> {
  if (!files?.length) return Promise.resolve([]);
  return Promise.all(
    Array.from(files).slice(0, 6).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          if (file.size > 900_000) {
            reject(new Error("Each photo must be under 900 KB."));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read that photo."));
          reader.readAsDataURL(file);
        }),
    ),
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
  const [signupDob] = useState(() => (editing ? "" : readSignupDob()));
  const [gender, setGender] = useState<Gender | "">(
    () => me.profile?.gender ?? "",
  );
  const [intent, setIntent] = useState<Intent | "">(
    () => me.profile?.intent ?? "",
  );
  const [interestsInput, setInterestsInput] = useState(() =>
    (me.profile?.interests ?? []).join(", "),
  );
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
    if (profile.bio.length > 400)
      errors.bio = "Keep this under 400 characters.";
    if (
      profile.town.trim().length < 2 ||
      !/^[\p{L}\p{M}\s.,'’()-]+$/u.test(profile.town)
    )
      errors.town = "Enter the town you want shown publicly.";
    if (
      profile.matchLocation.trim().length < 2 ||
      !/^[\p{L}\p{M}\s.,'’()-]+$/u.test(profile.matchLocation)
    )
      errors.matchLocation =
        "Enter where you want matches calculated from (private).";
    if (!gender) errors.gender = "Select your gender.";
    if (!intent) errors.intent = "Select what you are looking for.";
    if (!profile.photos.length)
      errors.photos = "Add at least one photo.";
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
      const interests = interestsInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      await api("/api/profile", {
        ...profile,
        gender,
        intent,
        interests,
        photo: profile.photos[0],
      });
      sessionStorage.removeItem(SIGNUP_DOB_KEY);
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
        Shown on your profile until reactions refine your taste.
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
        {profile.initialTags.length} of 3 selected.
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
                autoComplete="nickname"
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
            {(!signupDob || editing) && (
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
            )}
            <label>
              Town{" "}
              <span className="label-note">Shown on your profile</span>
              <input
                value={profile.town}
                onChange={(event) => set("town", event.target.value)}
                placeholder="e.g. Brooklyn"
                autoComplete="address-level2"
                required
                minLength={2}
                maxLength={60}
                aria-invalid={Boolean(fields.town)}
                aria-describedby={
                  fields.town ? "profile-error-town" : undefined
                }
              />
              {fieldError("town")}
            </label>
            <label>
              Match location{" "}
              <span className="label-note">Private · used for distance</span>
              <input
                value={profile.matchLocation}
                onChange={(event) => set("matchLocation", event.target.value)}
                placeholder="e.g. Brooklyn, NY"
                required
                minLength={2}
                maxLength={60}
                aria-invalid={Boolean(fields.matchLocation)}
                aria-describedby={
                  fields.matchLocation
                    ? "profile-error-matchLocation"
                    : undefined
                }
              />
              {fieldError("matchLocation")}
            </label>
            <label>
              Anything else
              <textarea
                value={profile.bio}
                onChange={(event) => set("bio", event.target.value)}
                placeholder="Optional. Memes, snacks, chaos."
                maxLength={400}
                rows={3}
                aria-invalid={Boolean(fields.bio)}
                aria-describedby={fields.bio ? "profile-error-bio" : undefined}
              />
              {fieldError("bio")}
            </label>
            <label>
              Interests
              <input
                value={interestsInput}
                onChange={(event) => setInterestsInput(event.target.value)}
                placeholder="coffee, hiking, indie games"
              />
              <span className="supporting">Comma-separated tags.</span>
            </label>
            <label>
              Gender
              <select
                value={gender}
                onChange={(event) =>
                  setGender(event.target.value as Gender | "")
                }
                aria-invalid={Boolean(fields.gender)}
                aria-describedby={
                  fields.gender ? "profile-error-gender" : undefined
                }
              >
                <option value="" disabled>
                  Select
                </option>
                {genders.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              {fieldError("gender")}
            </label>
            <label>
              Looking for
              <select
                value={intent}
                onChange={(event) =>
                  setIntent(event.target.value as Intent | "")
                }
                aria-invalid={Boolean(fields.intent)}
                aria-describedby={
                  fields.intent ? "profile-error-intent" : undefined
                }
              >
                <option value="" disabled>
                  Select
                </option>
                {(Object.keys(intentLabels) as Intent[]).map((value) => (
                  <option key={value} value={value}>
                    {intentLabels[value]}
                  </option>
                ))}
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
                {genders.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`choice ${profile.preferences.genders.includes(value) ? "selected" : ""}`}
                    aria-pressed={profile.preferences.genders.includes(value)}
                    onClick={() =>
                      set("preferences", {
                        ...profile.preferences,
                        genders: profile.preferences.genders.includes(value)
                          ? profile.preferences.genders.filter(
                              (item) => item !== value,
                            )
                          : [...profile.preferences.genders, value],
                      })
                    }
                  >
                    {value}
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
              <label>
                Match radius
                <select
                  value={profile.preferences.radiusMiles}
                  onChange={(event) =>
                    set("preferences", {
                      ...profile.preferences,
                      radiusMiles: Number(
                        event.target.value,
                      ) as Profile["preferences"]["radiusMiles"],
                    })
                  }
                >
                  {radiusOptions.map((miles) => (
                    <option key={miles} value={miles}>
                      {miles} miles
                    </option>
                  ))}
                </select>
              </label>
              {fieldError("preferences")}
            </fieldset>
            <fieldset>
              <legend>Your photos</legend>
              <p className="supporting">Add at least one. Up to six.</p>
              <label className="photo-upload">
                Upload photos
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => {
                    void readPhotos(event.target.files)
                      .then((photos) =>
                        set("photos", [...profile.photos, ...photos].slice(0, 6)),
                      )
                      .catch((cause) =>
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Could not add photos.",
                        ),
                      );
                    event.target.value = "";
                  }}
                />
              </label>
              {profile.photos.length > 0 && (
                <div className="upload-preview">
                  {profile.photos.map((photo, index) => (
                    <div key={`${index}-${photo.slice(0, 32)}`}>
                      <img src={photo} alt="" />
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          set(
                            "photos",
                            profile.photos.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {fieldError("photos")}
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
          <p>{me.profile!.town || me.profile!.location}</p>
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

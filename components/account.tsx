"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookmarkSimple, MapPin, SignOut } from "@phosphor-icons/react";
import type {
  Gender,
  Intent,
  Me,
  Meme,
  Profile,
  Match,
  PublicProfile,
  Tasteprint,
} from "@/lib/contracts";
import { ageOn } from "@/features/profile/age";
import { TONES } from "@/features/memes/taxonomy";
import { ProfilePosts } from "./profile-posts";

import {
  api,
  CardSkeleton,
  ErrorNote,
  Loading,
  MemeMedia,
  ProfileVisual,
  RequestError,
  SectionTitle,
} from "./ui";

const genders: Gender[] = ["woman", "man", "nonbinary"];
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
        <img className="brand-logo" src="/crackd-mark.png" alt="" />
        <span className="brand-name">crackd</span>
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
      <p className="eyebrow">A dating app with a sense of humor</p>
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
    </section>
  );
}

const radiusOptions = [5, 10, 25, 50, 100] as const;
function radiusLabel(miles: number): string {
  return miles === 100 ? "100+ miles" : `${miles} miles`;
}
const intentLabels: Record<Intent, string> = {
  relationship: "A relationship",
  casual: "Something casual",
  "figuring-it-out": "Figuring it out",
};
const genderLabels: Record<Gender, string> = {
  woman: "Woman",
  man: "Man",
  nonbinary: "Nonbinary",
};
type LocationOption = { code?: string; name: string };
type ReverseLocation = Pick<
  Profile,
  "town" | "state" | "stateCode" | "country" | "countryCode"
>;

function initialProfile(me: Me): Profile {
  const signupDob = readSignupDob();
  return (
    me.profile || {
      id: me.user.id,
      name: me.user.name,
      dob: signupDob,
      bio: "",
      town: "",
      state: "",
      country: "United States",
      stateCode: "",
      countryCode: "US",
      matchLocation: "",
      location: "",
      gender: "woman",
      photo: "",
      photos: [],
      favoriteMemes: [],
      interests: [],
      intent: "relationship",
      preferences: {
        genders: [],
        minAge: 18,
        maxAge: 45,
        radiusMiles: 25,
        minMatchPercent: 0,
      },
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
  const [countries, setCountries] = useState<LocationOption[]>([]);
  const [states, setStates] = useState<LocationOption[]>([]);
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [locationBusy, setLocationBusy] = useState(false);
  const section = useRef<HTMLElement>(null);
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile((previous) => ({ ...previous, [key]: value }));
  useEffect(() => {
    section.current?.scrollIntoView({ block: "start" });
    section.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    void api<LocationOption[]>("/api/locations?level=country")
      .then(setCountries)
      .catch(() => setError("Location presets are unavailable right now."));
  }, []);
  useEffect(() => {
    if (!profile.countryCode) {
      setStates([]);
      return;
    }
    void api<LocationOption[]>(
      `/api/locations?level=state&country=${profile.countryCode}`,
    )
      .then(setStates)
      .catch(() => setError("State and province presets are unavailable."));
  }, [profile.countryCode]);
  useEffect(() => {
    if (!profile.countryCode || !profile.stateCode) {
      setCities([]);
      return;
    }
    void api<LocationOption[]>(
      `/api/locations?level=city&country=${profile.countryCode}&state=${profile.stateCode}`,
    )
      .then(setCities)
      .catch(() => setError("Town presets are unavailable."));
  }, [profile.countryCode, profile.stateCode]);
  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Location access is unavailable. Choose your town manually.");
      return;
    }
    setError(null);
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const location = await api<ReverseLocation>("/api/locations", {
            latitude: Math.round(position.coords.latitude * 100) / 100,
            longitude: Math.round(position.coords.longitude * 100) / 100,
          });
          setProfile((previous) => ({
            ...previous,
            ...location,
            matchLocation: [location.town, location.state, location.country]
              .filter(Boolean)
              .join(", "),
          }));
          setFields((previous) => {
            const next = { ...previous };
            delete next.countryCode;
            delete next.stateCode;
            delete next.town;
            return next;
          });
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not use your location. Choose your town manually.",
          );
        } finally {
          setLocationBusy(false);
        }
      },
      (cause) => {
        setError(
          cause.code === 1
            ? "Location access was denied. Choose your town manually."
            : cause.code === 3
              ? "Finding your location timed out. Try again or choose your town manually."
              : "Could not find your location. Try again or choose your town manually.",
        );
        setLocationBusy(false);
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }
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
    if (!profile.countryCode || !profile.country)
      errors.countryCode = "Choose a supported country.";
    if (
      profile.town.trim().length < 2 ||
      !/^[\p{L}\p{M}\s.,'’()-]+$/u.test(profile.town)
    )
      errors.town = "Choose a town from the presets.";
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
        matchLocation: [profile.town, profile.state, profile.country]
          .filter(Boolean)
          .join(", "),
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
  const townOptions: LocationOption[] =
    profile.town && !cities.some((city) => city.name === profile.town)
      ? [{ name: profile.town }, ...cities]
      : cities;
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
              Country{" "}
              <span className="label-note">Choose from the supported countries</span>
              <select
                value={profile.countryCode}
                onChange={(event) => {
                  const countryCode = event.target.value;
                  const country = countries.find(
                    (option) => option.code === countryCode,
                  )?.name ?? "";
                  setProfile((previous) => ({
                    ...previous,
                    countryCode: countryCode as Profile["countryCode"],
                    country,
                    stateCode: "",
                    state: "",
                    town: "",
                    matchLocation: "",
                  }));
                }}
                required
                aria-invalid={Boolean(fields.countryCode)}
                aria-describedby={
                  fields.countryCode ? "profile-error-countryCode" : undefined
                }
              >
                <option value="">Choose a country</option>
                {countries.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
              {fieldError("countryCode")}
            </label>
            <label>
              State or province{" "}
              <span className="label-note">Shown with your town</span>
              <select
                value={profile.stateCode}
                onChange={(event) => {
                  const stateCode = event.target.value;
                  const state = states.find(
                    (option) => option.code === stateCode,
                  )?.name ?? "";
                  setProfile((previous) => ({
                    ...previous,
                    stateCode,
                    state,
                    town: "",
                    matchLocation: "",
                  }));
                }}
                disabled={!profile.countryCode}
                required
                aria-invalid={Boolean(fields.stateCode)}
                aria-describedby={
                  fields.stateCode ? "profile-error-stateCode" : undefined
                }
              >
                <option value="">Choose a state or province</option>
                {states.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
              {fieldError("stateCode")}
            </label>
            <label>
              Town{" "}
              <span className="label-note">
                Only town and state appear on your profile
              </span>
              <select
                value={profile.town}
                onChange={(event) => {
                  const town = event.target.value;
                  setProfile((previous) => ({
                    ...previous,
                    town,
                    matchLocation: [town, previous.state, previous.country]
                      .filter(Boolean)
                      .join(", "),
                  }));
                }}
                required
                aria-invalid={Boolean(fields.town)}
                aria-describedby={
                  fields.town ? "profile-error-town" : undefined
                }
                disabled={!profile.stateCode}
              >
                <option value="">Choose a town</option>
                {townOptions.map((option) => (
                  <option key={option.code || option.name} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
              {fieldError("town")}
            </label>
            {!editing && (
              <div className="location-action">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || locationBusy}
                  onClick={() => void useCurrentLocation()}
                >
                  <MapPin size={20} aria-hidden />
                  {locationBusy ? "Finding your town…" : "Use my location"}
                </button>
                <p className="supporting">
                  Uses an approximate location to choose a town. Your exact
                  location is not shown.
                </p>
              </div>
            )}
            <label>
              Bio
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
                    className={`choice ${profile.preferences.genders.includes(value) ? "selected" : ""}`}
                    aria-pressed={profile.preferences.genders.includes(value)}
                    key={value}
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
                      {radiusLabel(miles)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Minimum meme match
                <input
                  className="profile-range"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={profile.preferences.minMatchPercent ?? 0}
                  onChange={(event) =>
                    set("preferences", {
                      ...profile.preferences,
                      minMatchPercent: Number(event.target.value),
                    })
                  }
                  aria-label="Minimum meme match"
                />
                <small className="supporting">
                  Only people at or above this humor similarity score appear in
                  Discover.
                </small>
              </label>
              {fieldError("preferences")}
            </fieldset>
            <fieldset>
              <legend>Your photos</legend>
              <p className="supporting">Add at least one. Up to six.</p>
              <label className="photo-upload">
                <span>Choose files</span>
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
        {step === 3 && !editing && tagPicker}
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
  onSavedPosts,
  onSignedOut,
}: {
  me: Me;
  onRefresh: () => void;
  onSavedPosts: () => void;
  onSignedOut: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [taste, setTaste] = useState<Tasteprint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState<Meme[]>([]);
  useEffect(() => {
    api<Tasteprint>("/api/tasteprint")
      .then(setTaste)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    api<{ posts: Meme[] }>("/api/posts/mine")
      .then((result) => setPosts(result.posts))
      .catch((e) => setError(e.message));
  }, [me.user.id]);
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
  const profile = me.profile!;
  const photos = profile.photos.length
    ? profile.photos
    : profile.photo
      ? [profile.photo]
      : [];
  const age = ageOn(profile.dob);

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
      <SectionTitle title="Your profile" />
      <section className="profile-details" aria-labelledby="profile-details-title">
        <div className="profile-summary">
          <ProfileVisual
            className="profile-avatar"
            name={profile.name}
            src={profile.photo}
          />
          <div>
            <h2 id="profile-details-title">
              {profile.name}, {age}
            </h2>
            <p>
              {[
                profile.town || profile.location,
                profile.stateCode || profile.state,
                profile.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        </div>
        {profile.bio && <p className="bio">{profile.bio}</p>}
        <dl className="profile-facts">
          <div>
            <dt>Age</dt>
            <dd>{age}</dd>
          </div>
          <div>
            <dt>Gender</dt>
            <dd>{genderLabels[profile.gender]}</dd>
          </div>
          <div>
            <dt>Dating goals</dt>
            <dd>{intentLabels[profile.intent]}</dd>
          </div>
          <div>
            <dt>Interested in</dt>
            <dd>
              {profile.preferences.genders
                .map((gender) => genderLabels[gender])
                .join(", ")}
            </dd>
          </div>
          <div>
            <dt>Age range</dt>
            <dd>
              {profile.preferences.minAge}–{profile.preferences.maxAge}
            </dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>Within {radiusLabel(profile.preferences.radiusMiles)} of you</dd>
          </div>
        </dl>
        {profile.interests.length > 0 && (
          <div className="profile-detail-group">
            <h3>Interests</h3>
            <div className="profile-tag-list">
              {profile.interests.map((interest) => (
                <span key={interest}>{interest}</span>
              ))}
            </div>
          </div>
        )}
      </section>
      <button
        className="button secondary full"
        onClick={() => setEditing(true)}
      >
        Edit profile
      </button>
      <section className="profile-photos" aria-labelledby="profile-photos-title">
        <div className="section-heading-row">
          <div>
            <h2 id="profile-photos-title">Photos</h2>
          </div>
        </div>
        {photos.length ? (
          <div className="profile-photo-grid">
            {photos.map((photo, index) => (
              <ProfileVisual
                key={`${photo}-${index}`}
                name={profile.name}
                label={`${profile.name}'s dating profile photo ${index + 1}`}
                src={photo}
                className="profile-photo"
              />
            ))}
          </div>
        ) : (
          <p className="supporting">Add photos to finish your profile.</p>
        )}
      </section>
      <section className="profile-posts">
        <div className="section-heading-row">
          <div>
            <h2>Posts</h2>
          </div>
        </div>
        {posts.length ? (
          <div className="profile-post-grid">
            {posts.map((post) => (
              <figure className="profile-post-item" key={post.id}>
                <MemeMedia meme={post} compact />
                <figcaption>{post.caption}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="supporting">Your posts will live here.</p>
        )}
        <button
          className="button secondary full profile-saved-button"
          onClick={onSavedPosts}
        >
          <BookmarkSimple size={20} aria-hidden />
          Saved posts
        </button>
      </section>
      <section className="settings-section">
        <h2>Your sense of humor</h2>
        <p>{taste?.summary || "Every LOL tells us something."}</p>
        <p className="supporting">
          Built from {taste?.reactionCount ?? 0} reactions.
        </p>
      </section>
      <section className="settings-section">
        <h2>Your account</h2>
        <p>{me.user.email}</p>
        <p className="supporting">
          Your date of birth stays private. Block, report, and unmatch controls
          are available on people and chats.
        </p>
        <button className="text-button" disabled={busy} onClick={signOut}>
          <SignOut size={20} />
          Sign out
        </button>
      </section>
      <ErrorNote error={error} />
    </>
  );
}
export function PublicProfileScreen({
  profileId,
  onBack,
  onMatched,
}: {
  profileId: string;
  onBack: () => void;
  onMatched: (matchId: string) => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Meme[]>([]);
  const [likedPosts, setLikedPosts] = useState<Meme[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [matchStatus, setMatchStatus] = useState<
    "idle" | "busy" | "matched"
  >("idle");

  useEffect(() => {
    let active = true;
    setProfile(null);
    setPosts([]);
    setLikedPosts([]);
    setMatchStatus("idle");
    setError(null);
    api<{
      profile: PublicProfile;
      posts: Meme[];
      likedPosts: Meme[];
    }>(`/api/profiles/${encodeURIComponent(profileId)}`)
      .then((result) => {
        if (!active) return;
        setProfile(result.profile);
        setPosts(result.posts);
        setLikedPosts(result.likedPosts ?? []);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Profile unavailable.");
      });
    return () => {
      active = false;
    };
  }, [profileId]);

  async function matchProfile() {
    if (!profile || matchStatus === "busy" || matchStatus === "matched") return;
    setMatchStatus("busy");
    setError(null);
    try {
      const result = await api<{ match: Match | null }>(
        "/api/profile-decisions",
        { targetId: profile.id, decision: "like" },
      );
      if (result.match) {
        setMatchStatus("matched");
        onMatched(result.match.id);
      } else {
        setMatchStatus("idle");
        setError(
          "This profile is not eligible for a match under your current preferences.",
        );
      }
    } catch (cause) {
      setMatchStatus("idle");
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send the match request.",
      );
    }
  }

  return (
    <>
      <button
        className="icon-button"
        aria-label="Back to discover"
        onClick={onBack}
      >
        <ArrowLeft size={24} aria-hidden />
      </button>
      {error && !profile ? (
        <section className="session-error">
          <SectionTitle title="That profile moved on." />
          <ErrorNote error={error} />
        </section>
      ) : !profile ? (
        <CardSkeleton count={1} className="profile-skeleton" />
      ) : (
        <>
          <SectionTitle title={`${profile.name}'s profile`} />
          <section className="profile-details" aria-labelledby="public-profile-title">
            <div className="profile-summary">
              <ProfileVisual
                className="profile-avatar"
                name={profile.name}
                src={profile.photo}
              />
              <div>
                <h2 id="public-profile-title">
                  {profile.name}, {profile.age}
                </h2>
                <p>
                  {[profile.town || profile.location, profile.stateCode || profile.state]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            </div>
            {profile.bio && <p className="bio">{profile.bio}</p>}
            <dl className="profile-facts">
              <div>
                <dt>Dating goals</dt>
                <dd>{intentLabels[profile.intent]}</dd>
              </div>
              {profile.interests.length > 0 && (
                <div>
                  <dt>Interests</dt>
                  <dd>{profile.interests.join(", ")}</dd>
                </div>
              )}
            </dl>
          </section>
          <button
            className="button primary full profile-match-button"
            disabled={matchStatus === "busy" || matchStatus === "matched"}
            onClick={() => void matchProfile()}
          >
            {matchStatus === "busy"
              ? "Sending…"
              : matchStatus === "matched"
                ? "It’s a match"
                : "Match"}
            {matchStatus === "idle" && <ArrowRight size={20} />}
          </button>
          <ErrorNote error={error} />
          <ProfilePosts posts={likedPosts} />
          <section className="profile-photos" aria-labelledby="public-photos-title">
            <div className="section-heading-row">
              <h2 id="public-photos-title">Photos</h2>
            </div>
            <div className="profile-photo-grid">
              {profile.photos.map((photo, index) => (
                <ProfileVisual
                  key={`${photo}-${index}`}
                  name={`${profile.name}'s photo ${index + 1}`}
                  src={photo}
                  className="profile-photo"
                />
              ))}
            </div>
          </section>
          <section className="profile-posts">
            <div className="section-heading-row">
              <h2>Posts</h2>
            </div>
            {posts.length ? (
              <div className="profile-post-grid">
                {posts.map((post) => (
                  <MemeMedia key={post.id} meme={post} compact />
                ))}
              </div>
            ) : (
              <p className="supporting">Their posts will live here.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}

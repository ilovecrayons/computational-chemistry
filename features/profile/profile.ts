import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { profiles, users } from "../../db/schema";
import { ApiFailure } from "../../lib/api";
import { config } from "../../lib/config";
import type { Me, Preferences, Profile, PublicProfile } from "../../lib/contracts";
import { TONES } from "../memes/taxonomy";
import { ageOn } from "./age";

export { ageOn };

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date of birth.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.valueOf()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Use a valid date of birth.")
  .refine(
    (value) => ageOn(value) >= 18 && ageOn(value) <= 100,
    "You must be 18 or older (and enter a valid birth year).",
  );

const locationText = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(
    /^[\p{L}\p{M}\s.,'’()-]+$/u,
    "Enter a city or broad area, not an address.",
  );

const MAX_PHOTO_BYTES = 900_000;

function validPhotoRef(value: string): boolean {
  const match =
    /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return false;
  const base64 = match[1].replace(/\s/g, "");
  if (base64.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3)) return false;
  try {
    const decoded = Buffer.from(base64, "base64");
    return decoded.length > 0 && decoded.length <= MAX_PHOTO_BYTES;
  } catch {
    return false;
  }
}

const photoRef = z
  .string()
  .min(1)
  .refine(validPhotoRef, "Add at least one valid photo.");

function normalizePreferences(value: Preferences): Preferences {
  return {
    ...value,
    radiusMiles: value.radiusMiles ?? 25,
    minMatchPercent: value.minMatchPercent ?? 0,
  };
}

export const profileInput = z.object({
  name: z.string().trim().min(2, "Enter at least two characters.").max(40),
  dob: dateOfBirth,
  bio: z.string().trim().max(400).optional().default(""),
  town: locationText,
  state: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80),
  stateCode: z.string().trim().min(1).max(10),
  countryCode: z.enum(["US", "CA", "GB", "AU"]),
  matchLocation: locationText,
  gender: z.enum(["woman", "man", "nonbinary"]),
  photos: z.array(photoRef).min(1, "Add at least one photo.").max(6),
  interests: z
    .array(z.string().trim().min(1).max(40))
    .max(12)
    .default([]),
  intent: z.enum(["relationship", "casual", "figuring-it-out"]),
  preferences: z
    .object({
      genders: z
        .array(z.enum(["woman", "man", "nonbinary"]))
        .min(1)
        .max(3)
        .refine(
          (values) => new Set(values).size === values.length,
          "Choose each gender once.",
        ),
      minAge: z.number().int().min(18).max(100),
      maxAge: z.number().int().min(18).max(100),
      radiusMiles: z.union([
        z.literal(5),
        z.literal(10),
        z.literal(25),
        z.literal(50),
        z.literal(100),
      ]),
      minMatchPercent: z.number().int().min(0).max(100).default(0),
    })
    .refine((value) => value.minAge <= value.maxAge, {
      message: "Maximum age must be at least the minimum age.",
      path: ["maxAge"],
    }),
  initialTags: z
    .array(z.enum(TONES))
    .length(3, "Choose three humor tags.")
    .refine(
      (values) => new Set(values).size === 3,
      "Choose three different humor tags.",
    ),
});

export type ProfileRow = typeof profiles.$inferSelect;

function photosFor(row: ProfileRow): string[] {
  if (row.photos?.length) return row.photos;
  if (row.photo) return [row.photo];
  return [];
}

function townFor(row: ProfileRow): string {
  return row.town || row.location || "";
}

export function publicProfile(row: ProfileRow): PublicProfile {
  const town = townFor(row);
  const photos = photosFor(row);
  return {
    id: row.userId,
    name: row.name,
    age: ageOn(row.dob),
    town,
    state: row.state,
    stateCode: row.stateCode,
    bio: row.bio,
    photo: photos[0] ?? row.photo,
    photos,
    interests: row.interests ?? [],
    humorTags: row.initialTags,
    intent: row.intent,
    location: town,
  };
}

export function privateProfile(row: ProfileRow): Profile {
  const town = townFor(row);
  const photos = photosFor(row);
  return {
    id: row.userId,
    name: row.name,
    dob: row.dob,
    bio: row.bio,
    town,
    state: row.state,
    country: row.country,
    stateCode: row.stateCode,
    countryCode: row.countryCode,
    matchLocation: row.matchLocation || town,
    gender: row.gender,
    photo: photos[0] ?? row.photo,
    photos,
    favoriteMemes: row.favoriteMemes ?? [],
    interests: row.interests ?? [],
    intent: row.intent,
    preferences: normalizePreferences(row.preferences),
    initialTags: row.initialTags,
    complete: row.complete,
    location: town,
  };
}

export function getMe(userId: string): Me {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user)
    throw new ApiFailure(401, "UNAUTHENTICATED", "Sign in to continue.");
  const profile = db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .get();
  return {
    user: { id: user.id, email: user.email, name: user.name },
    profile: profile ? privateProfile(profile) : null,
    demoMode: config.demoMode,
  };
}

export function requireProfile(userId: string): ProfileRow {
  const row = db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .get();
  if (!row?.complete || ageOn(row.dob) < 18)
    throw new ApiFailure(
      403,
      "PROFILE_REQUIRED",
      "Complete your adult profile to continue.",
    );
  return row;
}

export function saveProfile(userId: string, input: unknown): Me {
  const value = profileInput.parse(input);
  const photos = value.photos;
  db.transaction((tx) => {
    const data = {
      ...value,
      photo: photos[0],
      favoriteMemes: [],
      location: value.town,
      userId,
      complete: true,
      updatedAt: new Date(),
    };
    tx.insert(profiles)
      .values(data)
      .onConflictDoUpdate({ target: profiles.userId, set: data })
      .run();
    tx.update(users)
      .set({ name: value.name, image: photos[0], updatedAt: new Date() })
      .where(eq(users.id, userId))
      .run();
  });
  return getMe(userId);
}

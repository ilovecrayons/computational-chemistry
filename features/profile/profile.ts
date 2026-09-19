import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { profiles, users } from "../../db/schema";
import { ApiFailure } from "../../lib/api";
import { config } from "../../lib/config";
import type { Me, Profile, PublicProfile } from "../../lib/contracts";
import { TONES } from "../memes/taxonomy";

export function ageOn(dob: string, today = new Date()): number {
  const [year, month, day] = dob.split("-").map(Number);
  return (
    today.getUTCFullYear() -
    year -
    (today.getUTCMonth() + 1 < month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)
      ? 1
      : 0)
  );
}
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
export const profileInput = z.object({
  name: z.string().trim().min(2, "Enter at least two characters.").max(40),
  dob: dateOfBirth,
  bio: z
    .string()
    .trim()
    .min(8, "Tell people a little about yourself.")
    .max(400),
  location: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(
      /^[\p{L}\p{M}\s.,'’()-]+$/u,
      "Enter a city or broad area, not an address.",
    ),
  gender: z.enum(["woman", "man", "nonbinary"]),
  photo: z
    .string()
    .regex(
      /^\/demo\/person-(?:[1-9]|10)\.svg$/,
      "Choose an available profile illustration.",
    ),
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
export function publicProfile(row: ProfileRow): PublicProfile {
  return {
    id: row.userId,
    name: row.name,
    age: ageOn(row.dob),
    bio: row.bio,
    location: row.location,
    photo: row.photo,
    intent: row.intent,
  };
}
export function privateProfile(row: ProfileRow): Profile {
  return {
    id: row.userId,
    name: row.name,
    dob: row.dob,
    bio: row.bio,
    location: row.location,
    gender: row.gender,
    photo: row.photo,
    intent: row.intent,
    preferences: row.preferences,
    initialTags: row.initialTags,
    complete: row.complete,
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
  db.transaction((tx) => {
    const data = { ...value, userId, complete: true, updatedAt: new Date() };
    tx.insert(profiles)
      .values(data)
      .onConflictDoUpdate({ target: profiles.userId, set: data })
      .run();
    tx.update(users)
      .set({ name: value.name, image: value.photo, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .run();
  });
  return getMe(userId);
}

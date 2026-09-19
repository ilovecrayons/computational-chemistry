import { hashPassword } from "better-auth/crypto";
import { inArray, or } from "drizzle-orm";
import { db } from "./index";
import {
  accounts,
  blocks,
  matches,
  memes,
  messages,
  profileDecisions,
  profiles,
  reactions,
  reports,
  users,
} from "./schema";
import { config } from "../lib/config";
import { ApiFailure } from "../lib/api";
import { ensureDemoMedia } from "../lib/media/demo";
import type { Gender, Intent, Preferences } from "../lib/contracts";
import { coverageOrder } from "../features/memes/feed";
import { demoSpecs } from "../features/memes/taxonomy";
import { compatibility, loadTastes } from "../features/matching/engine";

export const DEMO_PASSWORD = "Memeant-demo-2026!";
const allGenders: Gender[] = ["woman", "man", "nonbinary"];
export const demoPersonas = [
  {
    slug: "alex",
    name: "Alex",
    gender: "man",
    dob: "1999-04-12",
    bio: "Here for a good laugh and someone to split the last fries with.",
    favorites: ["absurd", "deadpan", "dating"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "jules",
    name: "Jules",
    gender: "nonbinary",
    dob: "1998-08-22",
    bio: "My love language is a suspiciously specific meme at 2pm. I make excellent bad playlists.",
    favorites: ["absurd", "deadpan", "dating"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "sam",
    name: "Sam",
    gender: "woman",
    dob: "1997-02-03",
    bio: "Tiny dogs, ambitious houseplants, and a camera roll full of deeply unserious things.",
    favorites: ["wholesome", "pets", "starter pack"],
    genders: ["woman"],
    intent: "relationship",
  },
  {
    slug: "river",
    name: "River",
    gender: "man",
    dob: "1996-11-19",
    bio: "Will overthink a joke and underthink a camping trip. Usually carrying snacks.",
    favorites: ["dark", "gaming", "deep-fried"],
    genders: allGenders,
    intent: "figuring-it-out",
  },
  {
    slug: "morgan",
    name: "Morgan",
    gender: "woman",
    dob: "1995-06-08",
    bio: "Weekend baker. Weekday spreadsheet enthusiast. Strong opinions about fictional pigeons.",
    favorites: ["deadpan", "work", "fake screenshot"],
    genders: ["man", "nonbinary"],
    intent: "relationship",
  },
  {
    slug: "casey",
    name: "Casey",
    gender: "nonbinary",
    dob: "2000-01-15",
    bio: "I fix bugs for a living and invent new problems for fun. Ask me about my keyboard.",
    favorites: ["cursed", "coding", "POV"],
    genders: allGenders,
    intent: "casual",
  },
  {
    slug: "taylor",
    name: "Taylor",
    gender: "woman",
    dob: "1998-09-09",
    bio: "Good coffee, terrible puns, and one very photogenic rescue dog. Looking for my picnic person.",
    favorites: ["wholesome", "pets", "starter pack"],
    genders: ["woman", "nonbinary"],
    intent: "relationship",
  },
  {
    slug: "robin",
    name: "Robin",
    gender: "man",
    dob: "1994-03-26",
    bio: "A board game can be a date if we agree not to take the rules personally.",
    favorites: ["cringe", "gaming", "reaction"],
    genders: ["man", "nonbinary"],
    intent: "figuring-it-out",
  },
  {
    slug: "avery",
    name: "Avery",
    gender: "nonbinary",
    dob: "2001-07-17",
    bio: "Chronically early to gigs. Chronically late to understanding the group chat.",
    favorites: ["absurd", "food", "deep-fried"],
    genders: ["woman", "man"],
    intent: "casual",
  },
  {
    slug: "quinn",
    name: "Quinn",
    gender: "woman",
    dob: "1993-12-04",
    bio: "Museum dates and feral little jokes. I will remember how you take your tea.",
    favorites: ["dark", "dating", "fake screenshot"],
    genders: ["man"],
    intent: "relationship",
  },
].map((person, index) => ({
  ...person,
  id: `demo-${person.slug}`,
  email: `${person.slug}@demo.local`,
  photo: `/demo/person-${index + 1}.svg`,
}));

export async function seedDemo(): Promise<void> {
  if (!config.demoMode)
    throw new ApiFailure(
      403,
      "DEMO_DISABLED",
      "Set DEMO_MODE=true to seed fictional demo identities.",
    );
  await ensureDemoMedia();
  const password = await hashPassword(DEMO_PASSWORD);
  const ids = demoPersonas.map((person) => person.id);
  const now = new Date("2026-09-01T12:00:00.000Z");
  const firstFifteen = coverageOrder(db.select().from(memes).all())
    .filter((meme) => meme.status === "ready" && meme.assetPath)
    .slice(0, 15);
  db.transaction((tx) => {
    // Keep auth sessions and all meme rows/files. Only the fictional personas' state resets.
    tx.delete(matches)
      .where(or(inArray(matches.userA, ids), inArray(matches.userB, ids)))
      .run();
    tx.delete(profileDecisions)
      .where(
        or(
          inArray(profileDecisions.actorId, ids),
          inArray(profileDecisions.targetId, ids),
        ),
      )
      .run();
    tx.delete(blocks)
      .where(or(inArray(blocks.actorId, ids), inArray(blocks.targetId, ids)))
      .run();
    tx.delete(reports)
      .where(or(inArray(reports.actorId, ids), inArray(reports.targetId, ids)))
      .run();
    tx.delete(reactions).where(inArray(reactions.userId, ids)).run();
    for (const person of demoPersonas) {
      const identity = {
        id: person.id,
        name: person.name,
        email: person.email,
        image: person.photo,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(users)
        .values(identity)
        .onConflictDoUpdate({
          target: users.id,
          set: { name: person.name, image: person.photo, updatedAt: now },
        })
        .run();
      tx.insert(accounts)
        .values({
          id: `account-${person.id}`,
          userId: person.id,
          accountId: person.id,
          providerId: "credential",
          password,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: accounts.id,
          set: { password, updatedAt: now },
        })
        .run();
      const preferences: Preferences = {
        genders: person.genders as Gender[],
        minAge: 21,
        maxAge: 38,
      };
      const profile = {
        userId: person.id,
        name: person.name,
        dob: person.dob,
        bio: person.bio,
        location: "Brooklyn, NY",
        gender: person.gender as Gender,
        photo: person.photo,
        intent: person.intent as Intent,
        preferences,
        initialTags: ["absurd", "deadpan", "cursed"],
        complete: person.slug !== "alex",
        updatedAt: now,
      };
      tx.insert(profiles)
        .values(profile)
        .onConflictDoUpdate({ target: profiles.userId, set: profile })
        .run();
      if (person.slug === "alex") continue;
      // Keep focused primary-topic tastes: broad OR favorites make every tag universal and erase IDF signal.
      const positives =
        person.slug === "jules"
          ? firstFifteen
          : demoSpecs
              .filter((meme) => person.favorites.includes(meme.topics[0]))
              .sort(
                (a, b) =>
                  person.favorites.filter((tag) => tag in b.tags).length -
                    person.favorites.filter((tag) => tag in a.tags).length ||
                  a.id.localeCompare(b.id),
              );
      const likedIds = new Set(positives.map((meme) => meme.id));
      const ranking = [
        ...positives,
        ...demoSpecs.filter((meme) => !likedIds.has(meme.id)),
      ];
      for (const [index, meme] of ranking.slice(0, 30).entries()) {
        const reaction = likedIds.has(meme.id)
          ? person.slug !== "jules" && index < 5
            ? ("strong-like" as const)
            : ("like" as const)
          : ("pass" as const);
        tx.insert(reactions)
          .values({
            userId: person.id,
            memeId: meme.id,
            reaction,
            createdAt: new Date(now.valueOf() + index),
            updatedAt: now,
          })
          .run();
      }
    }
    tx.insert(profileDecisions)
      .values({
        actorId: "demo-jules",
        targetId: "demo-alex",
        decision: "like",
        createdAt: now,
      })
      .run();
    tx.insert(profileDecisions)
      .values([
        {
          actorId: "demo-sam",
          targetId: "demo-taylor",
          decision: "like",
          createdAt: now,
        },
        {
          actorId: "demo-taylor",
          targetId: "demo-sam",
          decision: "like",
          createdAt: now,
        },
      ])
      .run();
    const { tastes, library } = loadTastes();
    const explanation = compatibility(
      tastes.get("demo-sam"),
      tastes.get("demo-taylor"),
      library,
    );
    tx.insert(matches)
      .values({
        id: "demo-match-sam-taylor",
        userA: "demo-sam",
        userB: "demo-taylor",
        compatibility: explanation,
        createdAt: now,
      })
      .run();
    tx.insert(messages)
      .values([
        {
          id: "demo-message-001",
          matchId: "demo-match-sam-taylor",
          senderId: "demo-sam",
          body: "Explain why this destroyed both of us.",
          memeId: explanation.sharedMemes[0]?.id ?? null,
          createdAt: new Date(now.valueOf() + 60_000),
        },
        {
          id: "demo-message-002",
          matchId: "demo-match-sam-taylor",
          senderId: "demo-taylor",
          body: "It is the absolute confidence. Zero qualifications, all commitment.",
          createdAt: new Date(now.valueOf() + 120_000),
        },
        {
          id: "demo-message-003",
          matchId: "demo-match-sam-taylor",
          senderId: "demo-sam",
          body: "Exactly my approach to making pancakes. Coffee this weekend?",
          createdAt: new Date(now.valueOf() + 180_000),
        },
      ])
      .run();
  });
}

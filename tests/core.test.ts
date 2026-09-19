import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Gender } from "../lib/contracts";
import type * as DatabaseModule from "../db";
import type * as SchemaModule from "../db/schema";
import type * as FeedModule from "../features/memes/feed";
import type * as EngineModule from "../features/matching/engine";
import type * as MatchingModule from "../features/matches/matches";
import type * as ChatModule from "../features/chat/chat";
import type * as ProfileModule from "../features/profile/profile";

process.env.DATABASE_URL = ":memory:";
process.env.BETTER_AUTH_SECRET =
  "core-regression-test-secret-not-for-deployment";
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DEMO_MODE = "false";

let database: typeof DatabaseModule;
let schema: typeof SchemaModule;
let feed: typeof FeedModule;
let engine: typeof EngineModule;
let matching: typeof MatchingModule;
let chat: typeof ChatModule;
let profile: typeof ProfileModule;

before(async () => {
  // Deliberately exercise config's module-loading boundary after selecting an isolated
  // in-memory database; static runtime imports would open the developer's real database.
  database = await import("../db");
  schema = await import("../db/schema");
  feed = await import("../features/memes/feed");
  engine = await import("../features/matching/engine");
  matching = await import("../features/matches/matches");
  chat = await import("../features/chat/chat");
  profile = await import("../features/profile/profile");
});
after(() => database.sqlite.close());
beforeEach(() => {
  database.sqlite.exec("DELETE FROM users; DELETE FROM memes;");
  const now = new Date("2026-01-01T00:00:00Z");
  for (const id of ["a", "close", "far"]) {
    database.db
      .insert(schema.users)
      .values({
        id,
        name: id,
        email: `${id}@example.test`,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.profiles)
      .values({
        userId: id,
        name: id,
        dob: "1998-01-01",
        bio: "A fictional adult profile.",
        location: "Brooklyn",
        town: "Brooklyn",
        matchLocation: "Brooklyn",
        gender: "man",
        photo: "/demo/person-1.svg",
        photos: ["/demo/person-1.svg"],
        favoriteMemes: [],
        interests: [],
        intent: "relationship",
        preferences: {
          genders: ["woman", "man", "nonbinary"],
          minAge: 18,
          maxAge: 50,
          radiusMiles: 25,
        },
        initialTags: ["absurd", "cursed", "deadpan"],
        complete: true,
        updatedAt: now,
      })
      .run();
  }
  for (const group of ["red", "blue"])
    for (let index = 0; index < 20; index++) {
      database.db
        .insert(schema.memes)
        .values({
          id: `${group}-${String(index).padStart(2, "0")}`,
          type: index % 7 === 0 ? "video" : "image",
          prompt: "Private generation prompt",
          caption: "A fictional illustrated joke.",
          tags:
            group === "red"
              ? { absurd: 1, coding: 1 }
              : { wholesome: 1, pets: 1 },
          chaos: (index % 5) + 1,
          taxonomyVersion: 1,
          assetPath: "fixture.svg",
          status: "ready",
          model: "fixture",
          createdAt: now,
        })
        .run();
    }
});
function like(userId: string, group: string, count: number) {
  for (let index = 0; index < count; index++)
    feed.setReaction(
      userId,
      `${group}-${String(index).padStart(2, "0")}`,
      "like",
    );
}
function matchPair() {
  matching.decideProfile("close", "a", "like");
  return matching.decideProfile("a", "close", "like").match!;
}

test("replacing a reaction changes the tasteprint without double-counting and keeps it out of unseen feed", () => {
  assert.equal(feed.setReaction("a", "red-00", "like").reactionCount, 1);
  assert.equal(feed.setReaction("a", "red-00", "strong-like").reactionCount, 1);
  assert.equal(engine.getTasteprint("a").positiveCount, 1);
  assert.equal(feed.setReaction("a", "red-00", "pass").reactionCount, 1);
  assert.equal(engine.getTasteprint("a").positiveCount, 0);
  assert.equal(
    feed.getFeed("a", null).memes.some((meme) => meme.id === "red-00"),
    false,
  );
});

test("a fixed overlap dataset ranks the matching taste above a disjoint taste", () => {
  like("a", "red", 10);
  like("close", "red", 10);
  like("far", "blue", 10);
  const candidates = engine.getCandidates("a");
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["close", "far"],
  );
  assert.equal(candidates[0].compatibility.score, 100);
  assert.equal(candidates[1].compatibility.score, 0);
  assert.deepEqual(candidates[0].compatibility.sharedTags, [
    "absurd",
    "coding",
  ]);
  assert.equal(candidates[0].compatibility.sharedMemes.length, 2);
  assert.equal("preferences" in candidates[0], false);
  assert.equal("dob" in candidates[0], false);
});

test("nine positive reactions never get a score, and the tenth unlocks actual similarity", () => {
  like("a", "red", 9);
  like("close", "red", 10);
  like("far", "blue", 10);
  feed.setReaction("a", "blue-00", "pass");
  assert.equal(engine.getTasteprint("a").reactionCount, 10);
  assert.equal(engine.getTasteprint("a").calibrated, false);
  assert.equal(
    engine
      .getCandidates("a")
      .every((candidate) => candidate.compatibility.score === null),
    true,
  );
  feed.setReaction("a", "red-09", "strong-like");
  assert.equal(engine.getTasteprint("a").calibrated, true);
  assert.equal(engine.getCandidates("a")[0].compatibility.score, 100);
});

test("mutual private gender and age preferences exclude otherwise compatible people before discovery or decisions", () => {
  like("a", "red", 10);
  like("close", "red", 10);
  like("far", "blue", 10);
  const original = profile.getMe("close").profile!;
  const genders: Gender[] = ["woman"];
  profile.saveProfile("close", {
    ...original,
    name: "Close",
    preferences: { genders, minAge: 18, maxAge: 50, radiusMiles: 25 },
  });
  assert.equal(
    engine.getCandidates("a").some((candidate) => candidate.id === "close"),
    false,
  );
  assert.throws(
    () => matching.decideProfile("a", "close", "like"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "PROFILE_NOT_FOUND",
  );
  const me = profile.getMe("a").profile!;
  profile.saveProfile("a", {
    ...me,
    name: "Alex",
    preferences: { ...me.preferences, minAge: 40, maxAge: 50 },
  });
  assert.deepEqual(engine.getCandidates("a"), []);
});

test("reciprocal decisions create one canonical match and repeated likes return the same match", () => {
  like("a", "red", 10);
  like("close", "red", 10);
  like("far", "blue", 10);
  assert.equal(matching.decideProfile("close", "a", "like").match, null);
  const first = matching.decideProfile("a", "close", "like").match!;
  assert.equal(
    matching.decideProfile("a", "close", "like").match!.id,
    first.id,
  );
  assert.equal(
    matching.decideProfile("close", "a", "like").match!.id,
    first.id,
  );
  assert.deepEqual(
    matching.getMatches("a").map((match) => match.id),
    [first.id],
  );
  assert.equal(
    engine.getCandidates("a").some((candidate) => candidate.id === "close"),
    false,
  );
});

test("chat excludes outsiders, authorizes shared memes, and closes immediately after blocking", () => {
  like("a", "red", 10);
  like("close", "red", 10);
  const match = matchPair();
  assert.throws(() => chat.getMessages("far", match.id, null));
  assert.throws(() =>
    chat.sendMessage("far", match.id, { body: "I should not be here." }),
  );
  assert.throws(() =>
    chat.sendMessage("a", match.id, { body: "Not shared", memeId: "blue-00" }),
  );
  const sent = chat.sendMessage("a", match.id, {
    body: "Our shared joke",
    memeId: "red-00",
  }).message;
  assert.deepEqual(chat.getMessages("close", match.id, null).messages, [sent]);
  matching.safetyAction("close", { targetId: "a", action: "block" });
  assert.throws(() => chat.getMessages("a", match.id, null));
  assert.throws(() =>
    chat.sendMessage("close", match.id, { body: "After block" }),
  );
  assert.deepEqual(matching.getMatches("a"), []);
});

test("message pagination covers same-time messages without duplicates and returns chronological pages", () => {
  const match = matchPair();
  const sent = Array.from(
    { length: 35 },
    (_, index) =>
      chat.sendMessage("a", match.id, { body: `Message ${index}` }).message,
  );
  const latest = chat.getMessages("close", match.id, null);
  const older = chat.getMessages("close", match.id, latest.nextCursor);
  const expected = sent.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  assert.deepEqual([...older.messages, ...latest.messages], expected);
  assert.equal(older.nextCursor, null);
});

test("feed cursors cover unseen snapshot items even as reactions are saved between pages", () => {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = feed.getFeed("a", cursor);
    for (const meme of page.memes) {
      assert.equal("tags" in meme, false);
      assert.equal("prompt" in meme, false);
      ids.push(meme.id);
      feed.setReaction("a", meme.id, "like");
    }
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 40);
  assert.equal(new Set(ids).size, 40);
  assert.deepEqual(feed.getFeed("a", null).memes, []);
});

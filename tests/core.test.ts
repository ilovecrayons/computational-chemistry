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
import type * as SocialModule from "../features/social/social";

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
let social: typeof SocialModule;

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
  social = await import("../features/social/social");
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
        location: "Brooklyn, NY",
        town: "Brooklyn",
        state: "New York",
        country: "United States",
        stateCode: "NY",
        countryCode: "US",
        matchLocation: "Brooklyn, NY",
        gender: "man",
        photo: "data:image/jpeg;base64,AA==",
        photos: ["data:image/jpeg;base64,AA=="],
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
  return matching.decideProfile("a", "close", "like").match!;
}

test("reactions persist the current choice and report only new positive reactions", () => {
  const first = feed.setReaction("a", "red-00", "like");
  assert.equal(first.reaction, "like");
  assert.equal(first.newPositive, true);
  assert.equal(first.reactionCount, 1);
  assert.equal(feed.setReaction("a", "red-00", "strong-like").reaction, "strong-like");
  assert.equal(feed.setReaction("a", "red-00", "strong-like").newPositive, false);
  assert.equal(engine.getTasteprint("a").positiveCount, 1);
  const pass = feed.setReaction("a", "red-00", "pass");
  assert.equal(pass.reaction, "pass");
  assert.equal(pass.newPositive, false);
  assert.equal(pass.reactionCount, 1);
  assert.equal(engine.getTasteprint("a").positiveCount, 0);
  assert.equal(social.getPost("a", "red-00").reaction, "pass");
  assert.equal(
    feed.getFeed("a", null).memes.some((meme) => meme.id === "red-00"),
    false,
  );
  const positiveAgain = feed.setReaction("a", "red-00", "like");
  assert.equal(positiveAgain.newPositive, true);
});

test("external X posts survive feed, social actions, shared compatibility, and chat", () => {
  database.sqlite.exec("DELETE FROM memes;");
  const now = new Date("2026-01-01T00:00:00Z");
  const xPost = {
    id: "1234567890123456789",
    url: "https://x.com/official/status/1234567890123456789",
    author: "Official Account",
    mediaType: "text" as const,
  };
  database.db
    .insert(schema.memes)
    .values({
      id: "x-1234567890123456789",
      type: "x",
      prompt: "Official X post",
      caption: "The original post text.",
      tags: { absurd: 1 },
      chaos: 2,
      taxonomyVersion: 2,
      assetPath: null,
      posterPath: null,
      xPost,
      status: "ready",
      model: "official-x",
      providerRequestId: null,
      failure: null,
      createdAt: now,
      completedAt: now,
      idempotencyKey: null,
      requestedBy: null,
    })
    .run();
  const surfaced = feed.getFeed("a", null).memes.find((meme) => meme.id.startsWith("x-"));
  assert.ok(surfaced);
  assert.equal(surfaced.type, "x");
  if (surfaced.type !== "x") throw new Error("Expected an official X post.");
  assert.equal(surfaced.xPost.id, xPost.id);
  assert.equal(surfaced.xPost.url, xPost.url);
  assert.equal(surfaced.caption, "The original post text.");
  assert.equal(surfaced.likeCount, 0);
  assert.equal(surfaced.commentCount, 0);
  assert.equal(surfaced.saved, false);
  assert.equal(surfaced.reaction, null);
  assert.equal(social.getPost("a", "x-1234567890123456789").reaction, null);
  assert.deepEqual(social.toggleSave("a", "x-1234567890123456789"), { saved: true });
  assert.equal(social.getSavedMemes("a")[0].type, "x");
  assert.equal(
    social.addComment("a", "x-1234567890123456789", { body: "Still real." }).memeId,
    "x-1234567890123456789",
  );
  feed.setReaction("a", "x-1234567890123456789", "like");
  feed.setReaction("close", "x-1234567890123456789", "like");
  const shared = engine.getCandidates("a").find((candidate) => candidate.id === "close");
  assert.equal(shared?.compatibility.sharedMemes[0]?.type, "x");
  const sent = chat.sendMessage("a", matchPair().id, {
    body: "Sharing the original.",
    memeId: "x-1234567890123456789",
  }).message;
  assert.equal(sent.memeId, "x-1234567890123456789");

  database.db
    .insert(schema.memes)
    .values({
      id: "x-invalid",
      type: "x",
      prompt: "Invalid source",
      caption: "Should not surface.",
      tags: { absurd: 1 },
      chaos: 2,
      taxonomyVersion: 2,
      status: "ready",
      model: "official-x",
      createdAt: now,
      xPost: { ...xPost, id: "999" },
    })
    .run();
  assert.equal(
    feed.getFeed("a", null).memes.some((meme) => meme.id === "x-invalid"),
    false,
  );
  assert.throws(() => feed.setReaction("a", "x-invalid", "like"));
});

test("overlapping tastes rank above disjoint tastes without a score floor", () => {
  like("a", "red", 10);
  like("close", "red", 10);
  like("far", "blue", 10);
  const candidates = engine.getCandidates("a");
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["close", "far"],
  );
  assert.ok(
    candidates[0].compatibility.score > candidates[1].compatibility.score,
  );
  assert.ok(candidates[1].compatibility.score < 81);
  assert.deepEqual(candidates[0].compatibility.sharedTags, [
    "absurd",
    "coding",
  ]);
  assert.equal(candidates[0].compatibility.sharedMemes.length, 2);
  assert.equal("preferences" in candidates[0], false);
  assert.equal("dob" in candidates[0], false);
});

test("universal shared taste tags retain positive compatibility signal", () => {
  like("a", "red", 10);
  like("close", "red", 10);
  like("far", "red", 10);
  const scores = engine
    .getCandidates("a")
    .map((candidate) => candidate.compatibility.score);
  assert.ok(scores.every((score) => score > 0));
  assert.equal(new Set(scores).size, 1);
});

test("compatibility updates after reactions and honors the match threshold", () => {
  like("close", "red", 10);
  like("far", "blue", 10);
  const before = engine.getCandidates("a");
  assert.ok(
    before.every((candidate) => candidate.compatibility.score < 81),
  );

  like("a", "red", 10);
  const after = engine.getCandidates("a");
  const closeBefore = before.find(
    (candidate) => candidate.id === "close",
  )!.compatibility.score;
  const closeAfter = after.find(
    (candidate) => candidate.id === "close",
  )!.compatibility.score;
  const farAfter = after.find(
    (candidate) => candidate.id === "far",
  )!.compatibility.score;
  assert.ok(closeAfter > closeBefore);
  assert.ok(closeAfter > farAfter);

  const me = profile.getMe("a").profile!;
  profile.saveProfile("a", {
    ...me,
    name: "Alex",
    preferences: { ...me.preferences, minMatchPercent: closeAfter },
  });
  assert.deepEqual(
    engine.getCandidates("a").map((candidate) => candidate.id),
    ["close"],
  );
});

test("candidate ranking exposes local distance and prioritizes nearby towns", () => {
  const farProfile = profile.getMe("far").profile!;
  profile.saveProfile("far", {
    ...farProfile,
    town: "Queens",
    location: "Queens, NY",
    matchLocation: "Queens, NY",
  });
  const candidates = engine.getCandidates("a");
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["close", "far"],
  );
  assert.equal(candidates[0].distanceMiles, 0);
  assert.ok((candidates[1].distanceMiles ?? 0) > 0);
});

test("private preferences exclude ranking while browse decisions do not create matches", () => {
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
  assert.equal(matching.decideProfile("a", "close", "like").match, null);
  const me = profile.getMe("a").profile!;
  profile.saveProfile("a", {
    ...me,
    name: "Alex",
    preferences: { ...me.preferences, minAge: 40, maxAge: 50 },
  });
  assert.deepEqual(engine.getCandidates("a"), []);
});

test("liked profile posts include only positive reactions and honor viewer blocks", () => {
  feed.setReaction("close", "red-00", "like");
  feed.setReaction("close", "red-01", "strong-like");
  feed.setReaction("close", "blue-00", "pass");
  feed.setReaction("a", "red-00", "pass");
  const liked = social.getUserLikedPosts("close", "a");
  assert.deepEqual(
    new Set(liked.map((post) => post.id)),
    new Set(["red-00", "red-01"]),
  );
  assert.equal(liked.find((post) => post.id === "red-00")?.reaction, "pass");
  assert.equal(liked.some((post) => post.id === "blue-00"), false);
  matching.safetyAction("a", { targetId: "close", action: "block" });
  assert.deepEqual(social.getUserLikedPosts("close", "a"), []);
});

test("unilateral profile likes create one canonical match and repeated likes are idempotent", () => {
  like("a", "red", 10);
  like("close", "red", 10);
  like("far", "blue", 10);
  const first = matching.decideProfile("a", "close", "like").match!;
  assert.equal(first.profile.id, "close");
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

test("unilateral matches authorize both chat members and block closes chat immediately", () => {
  like("a", "red", 10);
  like("close", "red", 10);
  const match = matchPair();
  assert.deepEqual(chat.getMessages("close", match.id, null).messages, []);
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

test("fifth opener persists the exact meme and only the actor auto-attaches it", () => {
  like("a", "red", 1);
  const match = matching.decideProfile("a", "close", "like", "red-00").match!;
  assert.equal(match.openerMeme?.id, "red-00");
  assert.equal(match.openerPendingForMe, true);
  assert.equal(matching.getMatches("close")[0].openerPendingForMe, false);

  const targetFirst = chat.sendMessage("close", match.id, {
    body: "I will not consume your opener.",
  }).message;
  assert.equal(targetFirst.memeId, null);
  assert.equal(targetFirst.meme, null);
  assert.equal(chat.getMessages("a", match.id, null).match.openerPendingForMe, true);

  const actorFirst = chat.sendMessage("a", match.id, {
    body: "Here is the context.",
  }).message;
  assert.equal(actorFirst.memeId, "red-00");
  assert.equal(actorFirst.meme?.id, "red-00");
  assert.equal(actorFirst.meme?.src, "/api/media/red-00");
  assert.equal(matching.getMatches("a")[0].openerPendingForMe, false);

  const actorSecond = chat.sendMessage("a", match.id, {
    body: "No second automatic attachment.",
  }).message;
  assert.equal(actorSecond.memeId, null);
  assert.equal(actorSecond.meme, null);
  assert.equal(
    chat
      .getMessages("close", match.id, null)
      .messages.find((message) => message.id === actorFirst.id)?.meme?.id,
    "red-00",
  );
});

test("unliked or forged opener memes cannot create a fifth-popup match", () => {
  assert.throws(() =>
    matching.decideProfile("a", "close", "like", "red-00"),
  );
  assert.deepEqual(matching.getMatches("a"), []);
});

test("ordinary matches keep text-only sends and stale opener media never bricks chat", () => {
  const ordinary = matchPair();
  const ordinaryMessage = chat.sendMessage("a", ordinary.id, {
    body: "Ordinary match context.",
  }).message;
  assert.equal(ordinaryMessage.memeId, null);
  assert.equal(ordinaryMessage.meme, null);

  like("a", "red", 1);
  const opener = matching.decideProfile("a", "far", "like", "red-00").match!;
  database.sqlite
    .prepare("UPDATE memes SET status = 'expired' WHERE id = ?")
    .run("red-00");
  const staleMessage = chat.sendMessage("a", opener.id, {
    body: "The opener expired, but chat still works.",
  }).message;
  assert.equal(staleMessage.memeId, null);
  assert.equal(staleMessage.meme, null);
  assert.equal(matching.getMatches("a").find((match) => match.id === opener.id)?.openerPendingForMe, false);
});

test("unmatching a unilateral match revokes chat authorization for both members", () => {
  const match = matching.decideProfile("a", "close", "like").match!;
  assert.deepEqual(chat.getMessages("a", match.id, null).messages, []);
  matching.safetyAction("a", { targetId: "close", action: "unmatch" });
  assert.throws(() => chat.getMessages("a", match.id, null));
  assert.throws(() => chat.getMessages("close", match.id, null));
  assert.deepEqual(matching.getMatches("a"), []);
  assert.deepEqual(matching.getMatches("close"), []);
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

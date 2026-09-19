import assert from "node:assert/strict";
import test from "node:test";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { IncomingMessage } from "node:http";
import type { ClientRequest, RequestOptions } from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { mapVideoState, XaiFailure } from "../lib/xai/video";

test("provider completion exposes an asset only after a real done response", () => {
  assert.deepEqual(
    mapVideoState({
      status: "pending",
      video: { url: "https://vidgen.x.ai/not-final.mp4" },
    }),
    { status: "generating" },
  );
  assert.deepEqual(
    mapVideoState({
      status: "done",
      video: {
        url: "https://vidgen.x.ai/finished.mp4",
        respect_moderation: true,
      },
    }),
    { status: "ready", url: "https://vidgen.x.ai/finished.mp4" },
  );
  assert.throws(() => mapVideoState({ status: "done", video: {} }), XaiFailure);
});

test("moderation rejection wins over a done status and downloadable URL", () => {
  const result = mapVideoState({
    status: "done",
    video: {
      url: "https://vidgen.x.ai/blocked.mp4",
      respect_moderation: false,
    },
  });
  assert.equal(result.status, "failed");
  assert.equal("url" in result, false);
});

test("failed and expired remain distinct terminal states and never echo provider secrets", () => {
  const failed = mapVideoState({
    status: "failed",
    error: {
      code: "unexpected",
      message: "Bearer super-secret-provider-credential",
    },
  });
  const expired = mapVideoState({
    status: "expired",
    video: { url: "https://vidgen.x.ai/stale.mp4" },
  });
  assert.equal(failed.status, "failed");
  assert.equal(expired.status, "expired");
  assert.equal(JSON.stringify(failed).includes("super-secret"), false);
  assert.equal("url" in expired, false);
});

test("unrecognized provider statuses fail closed rather than hanging indefinitely", () => {
  assert.throws(() => mapVideoState({ status: "completed" }), XaiFailure);
  assert.throws(() => mapVideoState(null), XaiFailure);
});

test("transient poll and CDN failures resume the same paid video through durable ready without another POST", async (context) => {
  // Static imports would open the developer's database before this isolated
  // configuration is selected; this test intentionally exercises module loading.
  const mediaDirectory = await mkdtemp(path.join(tmpdir(), "memeant-video-"));
  context.after(() => rm(mediaDirectory, { recursive: true, force: true }));
  process.env.MEDIA_DIR = mediaDirectory;
  process.env.DATABASE_URL = ":memory:";
  process.env.BETTER_AUTH_SECRET =
    "video-regression-test-secret-not-for-deployment";
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DEMO_MODE = "false";
  const originalKey = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "video-test-key-never-sent-to-a-network";
  context.after(() => {
    if (originalKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = originalKey;
  });
  const dnsMock = context.mock.method(dns, "lookup", async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  let downloads = 0;
  // Enough MP4 header bytes to exercise storage's signature boundary; poster
  // extraction may use its explicit neutral fallback for this minimal fixture.
  const mediaBytes = Buffer.from(
    "000000186674797069736f6d0000020069736f6d69736f32",
    "hex",
  );
  const httpsMock = context.mock.method(
    https,
    "get",
    (
      _url: string | URL,
      _options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      downloads++;
      const response = new IncomingMessage(new Socket());
      response.statusCode = downloads === 1 ? 503 : 200;
      response.headers = {
        "content-type": "video/mp4",
        "content-length": String(mediaBytes.length),
      };
      response.push(downloads === 1 ? null : mediaBytes);
      if (downloads !== 1) response.push(null);
      queueMicrotask(() => callback(response));
      return new EventEmitter() as ClientRequest;
    },
  );
  syncBuiltinESMExports();
  context.after(() => {
    dnsMock.mock.restore();
    httpsMock.mock.restore();
    syncBuiltinESMExports();
  });
  const { db, sqlite } = await import("../db");
  const { memes } = await import("../db/schema");
  const { getGeneration } = await import("../features/memes/generation");
  context.after(() => sqlite.close());
  db.insert(memes)
    .values({
      id: "external-x-not-a-job",
      type: "x",
      prompt: "Official X post",
      caption: "Text-only post",
      tags: { absurd: 1 },
      chaos: 1,
      taxonomyVersion: 2,
      status: "ready",
      model: "official-x",
      createdAt: new Date(),
      xPost: {
        id: "1234567890123456789",
        url: "https://x.com/official/status/1234567890123456789",
        author: "Official Account",
        mediaType: "text",
      },
    })
    .run();
  await assert.rejects(
    getGeneration("external-x-not-a-job"),
    (error: unknown) =>
      error instanceof Error &&
      "status" in error &&
      error.status === 404 &&
      "code" in error &&
      error.code === "GENERATION_NOT_FOUND",
  );
  db.insert(memes)
    .values({
      id: "recoverable-video",
      type: "video",
      prompt: "A fictional illustration",
      caption: "A video meme",
      tags: { absurd: 1, reaction: 1, pets: 1 },
      chaos: 2,
      taxonomyVersion: 1,
      status: "generating",
      model: "grok-imagine-video-1.5",
      providerRequestId: "paid-provider-job",
      createdAt: new Date(),
      idempotencyKey: "reserved-paid-video",
    })
    .run();
  let now = Date.now();
  context.mock.method(Date, "now", () => now);
  const requests: { url: string; method: string }[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), method: init?.method ?? "GET" });
      if (requests.length === 1) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(
                new Error("Simulated connection loss after response headers"),
              );
            },
          }),
        );
      }
      return Response.json(
        requests.length === 2
          ? { status: "pending" }
          : {
              status: "done",
              video: {
                url: "https://vidgen.x.ai/recovered.mp4",
                respect_moderation: true,
              },
            },
      );
    },
  );
  await assert.rejects(
    getGeneration("recoverable-video"),
    (error: unknown) =>
      error instanceof Error && "status" in error && error.status === 503,
  );
  now += 5_001;
  const resumed = await getGeneration("recoverable-video");
  assert.equal(resumed.status, "generating");
  now += 5_001;
  await assert.rejects(
    getGeneration("recoverable-video"),
    (error: unknown) =>
      error instanceof Error && "status" in error && error.status === 503,
  );
  assert.equal(
    downloads,
    1,
    "The first CDN response must be reached, not rejected as an unsafe public address.",
  );
  now += 5_001;
  const completed = await getGeneration("recoverable-video");
  assert.equal(completed.status, "ready");
  assert.equal(completed.src, "/api/media/recoverable-video");
  assert.deepEqual(
    await readFile(path.join(mediaDirectory, "recoverable-video.mp4")),
    mediaBytes,
  );
  assert.equal(downloads, 2);
  assert.deepEqual(requests, [
    { url: "https://api.x.ai/v1/videos/paid-provider-job", method: "GET" },
    { url: "https://api.x.ai/v1/videos/paid-provider-job", method: "GET" },
    { url: "https://api.x.ai/v1/videos/paid-provider-job", method: "GET" },
    { url: "https://api.x.ai/v1/videos/paid-provider-job", method: "GET" },
  ]);
  const { downloadProviderMedia } = await import("../lib/media/storage");
  await context.test(
    "private IPv4 and mapped IPv6 remain rejected before any CDN request",
    async () => {
      for (const [address, family] of [
        ["127.0.0.1", 4],
        ["::ffff:127.0.0.1", 6],
      ] as const) {
        dnsMock.mock.mockImplementation(async () => [{ address, family }]);
        await assert.rejects(
          downloadProviderMedia(
            "https://vidgen.x.ai/private.mp4",
            "private-video",
            "video",
          ),
          (error: unknown) =>
            error instanceof XaiFailure && error.code === "UNSAFE_MEDIA_URL",
        );
      }
      assert.equal(
        downloads,
        2,
        "Unsafe DNS responses must not contact the media server.",
      );
    },
  );
});

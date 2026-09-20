import { and, inArray, isNull, like, notInArray, or, sql } from "drizzle-orm";
import { TOPICS, TAXONOMY_VERSION } from "../features/memes/taxonomy";
import type { XPost } from "../lib/contracts";
import { db } from "./index";
import { memes } from "./schema";
import source from "./x-posts.json";

type SeedMediaType = XPost["mediaType"];

type XPostSeedRecord = {
  category: (typeof TOPICS)[number];
  url: string;
  author: string;
  text: string;
  mediaType: SeedMediaType;
};

type XPostSeedFile = {
  version: number;
  source: {
    path: string;
    searchedAt: string;
    model: string;
    selection: string;
    provenance?: {
      path: string;
      endpoint: string;
      model: string;
      discoveredAt?: string;
      recordedRequests?: number;
      completedResponses?: number;
      callAccounting?: string;
      citations: number;
      rawResponses: number;
    };
  };
  posts: XPostSeedRecord[];
};

const seedFile = source as XPostSeedFile;
const statusUrl = /^https:\/\/x\.com\/[^/]+\/status\/(\d+)$/;
const categorySet = new Set<string>(TOPICS);
const EXPECTED_X_POST_SEED_COUNT = 239;

function records(): Array<
  XPostSeedRecord & { id: string; statusId: string; xPost: XPost }
> {
  if (
    seedFile.version !== 1 ||
    seedFile.posts.length !== EXPECTED_X_POST_SEED_COUNT
  )
    throw new Error(
      `Invalid official X post seed file: expected ${EXPECTED_X_POST_SEED_COUNT} posts.`,
    );
  const createdIds = new Set<string>();
  return seedFile.posts.map((post) => {
    if (!categorySet.has(post.category))
      throw new Error(`Invalid official X post category: ${post.category}`);
    const match = statusUrl.exec(post.url);
    if (!match || !post.author.trim() || !post.text.trim())
      throw new Error(`Invalid official X post metadata: ${post.url}`);
    const statusId = match[1];
    const id = `x-${statusId}`;
    if (createdIds.has(id)) throw new Error(`Duplicate official X post: ${id}`);
    createdIds.add(id);
    return {
      ...post,
      id,
      statusId,
      xPost: {
        id: statusId,
        url: post.url,
        author: post.author,
        mediaType: post.mediaType,
      },
    };
  });
}

const seedTimestamp = new Date(seedFile.source.searchedAt);
if (Number.isNaN(seedTimestamp.valueOf()))
  throw new Error("Invalid official X post seed timestamp.");

export const X_POST_SEED_COUNT = EXPECTED_X_POST_SEED_COUNT;

type SeedOptions = { cleanupLegacy?: boolean };

/** Synchronize official X rows; legacy cleanup is opt-in for full demo resets. */
export function seedXPosts(options: SeedOptions = { cleanupLegacy: false }): void {
  const posts = records();
  const ids = posts.map((post) => post.id);
  db.transaction((tx) => {
    if (options.cleanupLegacy === true) {
      const obsolete = tx
        .select({ id: memes.id })
        .from(memes)
        .where(
          or(
            and(isNull(memes.requestedBy), like(memes.id, "library-%")),
            and(
              isNull(memes.requestedBy),
              sql`${memes.id} GLOB 'meme-[0-9][0-9][0-9]'`,
            ),
            and(
              isNull(memes.requestedBy),
              like(memes.id, "x-%"),
              notInArray(memes.id, ids),
            ),
          ),
        )
        .all();
      if (obsolete.length)
        tx.delete(memes)
          .where(inArray(memes.id, obsolete.map((row) => row.id)))
          .run();
    }
    for (const [index, post] of posts.entries()) {
      const tags: Record<string, number> = { [post.category]: 1 };
      tx.insert(memes)
        .values({
          id: post.id,
          type: "x",
          prompt: `Official X post ${post.url}`,
          caption: post.text,
          tags,
          chaos: (index % 5) + 1,
          taxonomyVersion: TAXONOMY_VERSION,
          assetPath: null,
          posterPath: null,
          xPost: post.xPost,
          status: "ready",
          model: "official-x",
          providerRequestId: null,
          failure: null,
          createdAt: seedTimestamp,
          completedAt: seedTimestamp,
          idempotencyKey: null,
          requestedBy: null,
        })
        .onConflictDoUpdate({
          target: memes.id,
          set: {
            type: "x",
            prompt: `Official X post ${post.url}`,
            caption: post.text,
            tags,
            chaos: (index % 5) + 1,
            taxonomyVersion: TAXONOMY_VERSION,
            assetPath: null,
            posterPath: null,
            xPost: post.xPost,
            status: "ready",
            model: "official-x",
            providerRequestId: null,
            failure: null,
            createdAt: seedTimestamp,
            completedAt: seedTimestamp,
            idempotencyKey: null,
            requestedBy: null,
          },
        })
        .run();
    }
  });
}

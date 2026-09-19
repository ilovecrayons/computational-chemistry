import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  Compatibility,
  Gender,
  Intent,
  NotificationType,
  Preferences,
  Reaction,
  XPost,
} from "../lib/contracts";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("accounts_user_idx").on(table.userId),
    uniqueIndex("accounts_provider_identity").on(
      table.providerId,
      table.accountId,
    ),
  ],
);
export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dob: text("dob").notNull(),
  bio: text("bio").notNull(),
  location: text("location").notNull(),
  town: text("town").notNull().default(""),
  state: text("state").notNull().default(""),
  country: text("country").notNull().default(""),
  stateCode: text("state_code").notNull().default(""),
  countryCode: text("country_code").notNull().default("US"),
  matchLocation: text("match_location").notNull().default(""),
  gender: text("gender").$type<Gender>().notNull(),
  photo: text("photo").notNull(),
  photos: text("photos", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  favoriteMemes: text("favorite_memes", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  interests: text("interests", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  intent: text("intent").$type<Intent>().notNull(),
  preferences: text("preferences", { mode: "json" })
    .$type<Preferences>()
    .notNull(),
  initialTags: text("initial_tags", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  complete: integer("complete", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const memes = sqliteTable(
  "memes",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["image", "video", "x"] }).notNull(),
    prompt: text("prompt").notNull(),
    caption: text("caption").notNull(),
    tags: text("tags", { mode: "json" })
      .$type<Record<string, number>>()
      .notNull(),
    chaos: integer("chaos").notNull(),
    taxonomyVersion: integer("taxonomy_version").notNull(),
    assetPath: text("asset_path"),
    posterPath: text("poster_path"),
    xPost: text("x_post", { mode: "json" }).$type<XPost | null>(),
    status: text("status", {
      enum: ["queued", "generating", "ready", "failed", "expired"],
    }).notNull(),
    model: text("model").notNull(),
    providerRequestId: text("provider_request_id"),
    failure: text("failure"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    idempotencyKey: text("idempotency_key").unique(),
    requestedBy: text("requested_by"),
  },
  (table) => [
    index("memes_status_created_idx").on(
      table.status,
      table.createdAt,
      table.id,
    ),
  ],
);
export const reactions = sqliteTable(
  "reactions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memeId: text("meme_id")
      .notNull()
      .references(() => memes.id, { onDelete: "cascade" }),
    reaction: text("reaction").$type<Reaction>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.memeId] }),
    index("reactions_meme_idx").on(table.memeId),
  ],
);
export const postComments = sqliteTable(
  "post_comments",
  {
    id: text("id").primaryKey(),
    memeId: text("meme_id")
      .notNull()
      .references(() => memes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("post_comments_meme_idx").on(table.memeId)],
);
export const savedMemes = sqliteTable(
  "saved_memes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memeId: text("meme_id")
      .notNull()
      .references(() => memes.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.memeId] })],
);
export const profileDecisions = sqliteTable(
  "profile_decisions",
  {
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: text("decision", { enum: ["like", "pass"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.targetId] })],
);
export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    userA: text("user_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userB: text("user_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    compatibility: text("compatibility", { mode: "json" })
      .$type<Compatibility>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    unmatchedAt: integer("unmatched_at", { mode: "timestamp_ms" }),
  },
  (table) => [uniqueIndex("matches_pair_unique").on(table.userA, table.userB)],
);
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    memeId: text("meme_id").references(() => memes.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("messages_match_cursor_idx").on(
      table.matchId,
      table.createdAt,
      table.id,
    ),
  ],
);
export const blocks = sqliteTable(
  "blocks",
  {
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.targetId] })],
);
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetId: text("target_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").$type<NotificationType>().notNull(),
    message: text("message").notNull(),
    memeId: text("meme_id").references(() => memes.id, {
      onDelete: "cascade",
    }),
    matchId: text("match_id").references(() => matches.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("notifications_recipient_idx").on(
      table.recipientId,
      table.createdAt,
    ),
  ],
);

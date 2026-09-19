import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { accounts, sessions, users, verifications } from "../db/schema";
import { config } from "./config";

export const auth = betterAuth({
  appName: "Computational Chemistry",
  baseURL: config.baseUrl,
  secret: config.secret,
  trustedOrigins: [config.baseUrl],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  advanced: { useSecureCookies: new URL(config.baseUrl).protocol === "https:" },
});

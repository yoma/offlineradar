import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Neon app_users.id — never an admin privilege claim. */
      id?: string;
    } & DefaultSession["user"];
    /** True when Google identity worked but Neon user upsert failed. */
    accountProvisionError?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    emailVerified?: boolean;
    /** Neon app_users.id */
    appUserId?: string;
    /** Set when upsertAppUserFromGoogle fails or returns null after Google OK. */
    accountProvisionError?: boolean;
  }
}

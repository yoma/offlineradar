import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Neon app_users.id — never an admin privilege claim. */
      id?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    emailVerified?: boolean;
    /** Neon app_users.id */
    appUserId?: string;
  }
}

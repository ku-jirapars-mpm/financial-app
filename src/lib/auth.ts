import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getPool } from "./db";
import { authOptions } from "./auth-config";

export const auth = betterAuth({
  ...authOptions(getPool()),
  plugins: [nextCookies()],
});

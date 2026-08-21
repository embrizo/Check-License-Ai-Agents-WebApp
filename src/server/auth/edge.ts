import NextAuth from "next-auth";
import { authConfigEdge } from "./config.edge";

/**
 * Minimal Auth.js instance for the middleware (src/proxy.ts) only. It shares
 * AUTH_SECRET and the JWT callbacks with the full instance in ./index.ts — so it
 * reads the exact same session cookie — but carries no Credentials provider,
 * bcrypt or DB, keeping the middleware bundle Edge-runtime compatible (required
 * by @opennextjs/cloudflare; see ./config.edge.ts).
 */
export const { auth } = NextAuth(authConfigEdge);

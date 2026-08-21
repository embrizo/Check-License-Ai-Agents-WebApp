import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/db/schema";
import "./types";

// See ./jwt.d.ts — the JWT augmentation doesn't merge into the type
// NextAuthConfig actually uses for `token`, so it types as `{}`. Cast
// explicitly here rather than depend on it.
interface AppJWT {
  sub?: string;
  role?: UserRole;
  organizationId?: string | null;
  mustChangePassword?: boolean;
}

/**
 * Edge-runtime-safe Auth.js config, used ONLY by the middleware (src/proxy.ts)
 * via ./edge.ts. It deliberately carries no Credentials provider, no bcrypt and
 * no database import, so the middleware bundle compiles for the Edge runtime.
 *
 * This is required to deploy on Cloudflare (via @opennextjs/cloudflare): OpenNext
 * does not support Node.js middleware, and importing the full ./config.ts (which
 * pulls in bcryptjs + the data layer) forces the middleware into the Node runtime
 * and fails the build with "Node.js middleware is not currently supported".
 *
 * The middleware only ever *reads* the JWT (it never signs anyone in), so the
 * provider is unnecessary here. The full config (./config.ts) spreads this and
 * adds the Credentials provider; both share these callbacks and the same
 * AUTH_SECRET, so a token minted by the full instance is readable here.
 */
export const authConfigEdge: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },   // 8h — a workday
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      const t = token as AppJWT;
      if (user) {
        t.role = user.role;
        t.organizationId = user.organizationId;
        t.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as AppJWT;
      session.user.id = t.sub!;
      session.user.role = t.role!;
      session.user.organizationId = t.organizationId ?? null;
      session.user.mustChangePassword = t.mustChangePassword ?? false;
      return session;
    },
  },
};

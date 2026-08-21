import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getUserByEmail, recordLogin } from "@/server/data/users";
import { authConfigEdge } from "./config.edge";
import "./types";

const LoginInput = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

// Precomputed bcrypt hash of an arbitrary string — compared against on every
// login attempt for a nonexistent email, so response time doesn't reveal
// which addresses are registered.
const DUMMY_HASH = "$2b$12$9ix8c7ngGuoxLFN.sLCW5ea1yicKNVCRs2DRdc9wdf7n.006938Yq";

/**
 * The full config: the Edge-safe base (session, pages, callbacks — see
 * ./config.edge.ts) plus the Credentials provider, which pulls in bcrypt and the
 * database and so must never reach the middleware bundle. Used by the API route
 * (app/api/auth/[...nextauth]) and server-side auth()/signIn()/signOut() only.
 */
export const authConfig: NextAuthConfig = {
  ...authConfigEdge,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = LoginInput.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await getUserByEmail(email);

        const hash = user?.passwordHash ?? DUMMY_HASH;
        const ok = await bcrypt.compare(password, hash);

        if (!user || !ok || !user.isActive) return null;

        await recordLogin(user.id);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
};

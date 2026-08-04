import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getUserByEmail, recordLogin } from "@/server/data/users";
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

const LoginInput = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

// Precomputed bcrypt hash of an arbitrary string — compared against on every
// login attempt for a nonexistent email, so response time doesn't reveal
// which addresses are registered.
const DUMMY_HASH = "$2b$12$9ix8c7ngGuoxLFN.sLCW5ea1yicKNVCRs2DRdc9wdf7n.006938Yq";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },   // 8h — a workday
  pages: { signIn: "/login" },
  trustHost: true,
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

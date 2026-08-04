// Best-effort augmentation, kept for editor/future-version support — but do
// NOT rely on it. The `token` parameter inside NextAuthConfig's `jwt`/
// `session` callbacks resolves through @auth/core's own relative import of
// "./jwt.js", and empirically (next-auth 5.0.0-beta.32, TypeScript 5.9,
// moduleResolution: bundler) that reference doesn't pick up either this
// augmentation or one on "next-auth/jwt" — `token.<field>` types as `{}`
// regardless. config.ts casts explicitly instead of depending on this.
//
// Also: this file must have zero regular imports from "next-auth" — a file
// that both imports "next-auth" and declares an ambient module here makes
// TypeScript fail to even resolve the module specifier ("Invalid module
// name in augmentation"). See ./types.ts for the augmentation that does
// merge correctly (Session/User), which needs the real import.
declare module "@auth/core/jwt" {
  interface JWT {
    role?: import("@/db/schema").UserRole;
    organizationId?: string | null;
    mustChangePassword?: boolean;
  }
}

import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getUserById } from "@/server/data/users";
import { checkAccess } from "./subscription";
import { roleAtLeast } from "./role";
import { ForbiddenError, SubscriptionError } from "./errors";
import type { UserRole } from "@/db/schema";

/** Clears the cookie, then lands on /login — see app/api/session/end/route.ts. */
export const SESSION_END_ROUTE = "/api/session/end";

/**
 * The single guard every Server Action and Route Handler calls first.
 * `super_admin` bypasses org scoping entirely (orgId: null) — otherwise a
 * lapsed subscription could lock the operator out of the console needed to
 * fix it. Every other caller gets back a concrete orgId to scope queries by.
 *
 * The session JWT is proof of *authentication* only. Role, organization and
 * active status are re-read from the database on every call and the DB wins,
 * because the token is a snapshot from sign-in that lives for 8 hours: without
 * this, deactivating a compromised or departed account has no effect until it
 * expires, and demoting an admin leaves their old privileges live just as
 * long. One indexed primary-key lookup is a cheap price for revocation that
 * actually revokes.
 */
export async function requireOrgAccess(opts?: { role?: UserRole; write?: boolean }) {
  const session = await auth();
  const user = session?.user ? await getUserById(session.user.id) : null;

  // Redirect rather than throw: "no longer signed in" is a normal state with
  // an obvious destination, and a page-level throw would race the layout's own
  // redirect and surface as "Something went wrong" instead. `redirect` works
  // from pages, Route Handlers and Server Actions alike, and its NEXT_REDIRECT
  // passes straight through the guardErrorMessage() catches (which return null
  // for it, so callers rethrow).
  //
  // The target is the sign-out handler, never /login directly: a deactivated
  // user still holds a valid-looking cookie, and proxy.ts would bounce them
  // from /login back into the app forever. See app/api/session/end/route.ts.
  if (!session?.user || !user || !user.isActive) redirect(SESSION_END_ROUTE);

  // Hand back a session whose claims match the database, so callers reading
  // `session.user.role` downstream can never act on a stale token value.
  const fresh = {
    ...session,
    user: {
      ...session.user,
      role: user.role,
      organizationId: user.organizationId,
      name: user.name,
      email: user.email,
    },
  };

  if (user.role === "super_admin") {
    return { session: fresh, orgId: null as string | null, user };
  }

  const orgId = user.organizationId;
  if (!orgId) throw new ForbiddenError();

  if (opts?.role && !roleAtLeast(user.role, opts.role)) {
    throw new ForbiddenError();
  }

  if (opts?.write) {
    const access = await checkAccess(orgId);
    if (!access.ok) throw new SubscriptionError(access.reason);
  }

  return { session: fresh, orgId, user };
}

/**
 * Layout-friendly variant: returns null instead of throwing, so a layout can
 * `redirect("/login")` rather than blow up into an error boundary. Same
 * database-wins rule as requireOrgAccess — a layout that gates on the token's
 * role would still render an admin shell for someone just demoted.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;

  const user = await getUserById(session.user.id);
  if (!user || !user.isActive) return null;
  return user;
}

/** Variant for entry points that must always be scoped to a real org (never super_admin's null). */
export async function requireOrg(opts?: { role?: UserRole; write?: boolean }) {
  const { session, orgId, user } = await requireOrgAccess(opts);
  if (!orgId) throw new ForbiddenError();
  return { session, orgId, user };
}

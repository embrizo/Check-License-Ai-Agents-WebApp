import { NextResponse } from "next/server";
import { signOut } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Terminates a session whose user is no longer valid — deactivated, deleted,
 * or otherwise revoked since the JWT was issued.
 *
 * This has to be a Route Handler, not a redirect from the guard, because only
 * a handler may clear cookies; a Server Component cannot write them during
 * render. Redirecting a revoked-but-cookie-bearing user straight to /login
 * would loop forever: proxy.ts sees an apparently-valid session cookie and
 * bounces /login back to /dashboard, whose guard bounces it to /login again.
 * Clearing the cookie first is what breaks that cycle.
 *
 * It lives under /api so proxy.ts's matcher skips it (see its `config`).
 */
export async function GET(request: Request) {
  await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/login?sessionEnded=1", request.url));
}

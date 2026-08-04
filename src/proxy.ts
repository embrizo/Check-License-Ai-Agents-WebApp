import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

// Next.js 16 renamed `middleware` to `proxy` — same mechanism, same limits:
// cheap, cookie-derived checks only. It is NOT a security boundary; the
// authoritative session + role + subscription check is requireOrgAccess()
// (src/server/auth/guards.ts), re-run inside every Server Action and Route
// Handler. See docs/04-auth-and-subscriptions.md §4.
const PUBLIC_ROUTES = new Set(["/login", "/set-password"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_ROUTES.has(pathname);

  if (!req.auth && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (req.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  if (req.auth?.user.mustChangePassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

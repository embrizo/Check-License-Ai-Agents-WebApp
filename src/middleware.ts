import { NextResponse } from "next/server";
// Edge-safe auth instance — NOT @/server/auth. The middleware must stay free of
// bcrypt/DB so it runs on the Edge runtime. See src/server/auth/config.edge.ts.
import { auth } from "@/server/auth/edge";

// This is deliberately `middleware.ts`, NOT Next 16's new `proxy.ts`: in Next 16
// `proxy` runs on the Node.js runtime (not configurable), and @opennextjs/
// cloudflare does not support Node.js middleware. `middleware` still runs on the
// Edge runtime, which OpenNext/Cloudflare supports (see docs 16-proxy / the v16
// upgrade guide). Same mechanism, same limits: cheap, cookie-derived checks
// only. It is NOT a security boundary; the authoritative session + role +
// subscription check is requireOrgAccess() (src/server/auth/guards.ts), re-run
// inside every Server Action and Route Handler. See docs/04 §4.
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

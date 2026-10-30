import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Fast redirect for signed-out visitors. This only checks that a session
// cookie exists; real validation happens server-side in requireUser() and
// the database enforces ownership through RLS.
const PUBLIC = ["/login", "/signup", "/offline", "/api/auth", "/manifest.webmanifest", "/sw.js", "/icons", "/apple-icon", "/icon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p + "."))) {
    return NextResponse.next();
  }
  if (!getSessionCookie(req, { cookiePrefix: "myfinance" })) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

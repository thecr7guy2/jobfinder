import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/dashboard/constants";
import { parseEdgeSessionCookieValue } from "@/lib/dashboard/auth-edge";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedPath =
    pathname === "/inbox" ||
    pathname === "/tracker" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/jobs/") ||
    pathname.startsWith("/api/status/update");

  if (!protectedPath) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const role = await parseEdgeSessionCookieValue(cookieValue);
  if (!role) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/inbox", "/tracker", "/dashboard", "/jobs/:path*", "/api/status/update"],
};

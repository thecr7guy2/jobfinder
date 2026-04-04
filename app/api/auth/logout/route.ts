import { NextResponse } from "next/server";

import { clearSessionCookieConfig } from "@/lib/dashboard/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(clearSessionCookieConfig);
  return response;
}

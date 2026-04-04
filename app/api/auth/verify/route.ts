import { NextResponse } from "next/server";

import { resolveRoleFromCode, sessionCookieConfig } from "@/lib/dashboard/auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = payload?.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "Access code is required." }, { status: 400 });
  }

  const role = resolveRoleFromCode(code);
  if (!role) {
    return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, role });
  response.cookies.set(sessionCookieConfig(role));
  return response;
}

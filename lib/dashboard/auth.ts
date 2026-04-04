import { createHmac, timingSafeEqual } from "crypto";

import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/dashboard/constants";
import type { AccessRole } from "@/lib/dashboard/types";

function requiredCode(name: "VIEWER_ACCESS_CODE" | "OWNER_ACCESS_CODE"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function authSecret(): string {
  return `${requiredCode("VIEWER_ACCESS_CODE")}::${requiredCode("OWNER_ACCESS_CODE")}`;
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("hex");
}

export function resolveRoleFromCode(code: string): AccessRole | null {
  const viewer = requiredCode("VIEWER_ACCESS_CODE");
  const owner = requiredCode("OWNER_ACCESS_CODE");
  if (code === owner) {
    return "owner";
  }
  if (code === viewer) {
    return "viewer";
  }
  return null;
}

export function createSessionCookieValue(role: AccessRole): string {
  const payload = `role=${role}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionCookieValue(value: string | undefined): AccessRole | null {
  if (!value) {
    return null;
  }

  const [payload, providedSignature] = value.split(".");
  if (!payload || !providedSignature) {
    return null;
  }

  const expectedSignature = sign(payload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  const role = payload.replace("role=", "");
  return role === "viewer" || role === "owner" ? role : null;
}

export async function getSessionRole(): Promise<AccessRole | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  return parseSessionCookieValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export function sessionCookieConfig(role: AccessRole) {
  return {
    name: SESSION_COOKIE_NAME,
    value: createSessionCookieValue(role),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export const clearSessionCookieConfig = {
  name: SESSION_COOKIE_NAME,
  value: "",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 0,
};

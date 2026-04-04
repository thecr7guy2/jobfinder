import type { AccessRole } from "@/lib/dashboard/types";

function authSecret(): string | null {
  const viewer = process.env.VIEWER_ACCESS_CODE;
  const owner = process.env.OWNER_ACCESS_CODE;
  if (!viewer || !owner) {
    return null;
  }
  return `${viewer}::${owner}`;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function sign(payload: string): Promise<string | null> {
  const secret = authSecret();
  if (!secret) {
    return null;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(new Uint8Array(signature));
}

export async function parseEdgeSessionCookieValue(value: string | undefined): Promise<AccessRole | null> {
  if (!value) {
    return null;
  }

  const [payload, providedSignature] = value.split(".");
  if (!payload || !providedSignature) {
    return null;
  }

  const expectedSignature = await sign(payload);
  if (!expectedSignature || !constantTimeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  const role = payload.replace("role=", "");
  return role === "viewer" || role === "owner" ? role : null;
}

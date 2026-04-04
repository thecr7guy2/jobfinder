import { describe, expect, it, vi } from "vitest";

import { parseEdgeSessionCookieValue } from "@/lib/dashboard/auth-edge";
import {
  createSessionCookieValue,
  parseSessionCookieValue,
  resolveRoleFromCode,
} from "@/lib/dashboard/auth";

describe("dashboard auth helpers", () => {
  vi.stubEnv("VIEWER_ACCESS_CODE", "viewer-123");
  vi.stubEnv("OWNER_ACCESS_CODE", "owner-123");

  it("maps access codes to roles", () => {
    expect(resolveRoleFromCode("viewer-123")).toBe("viewer");
    expect(resolveRoleFromCode("owner-123")).toBe("owner");
    expect(resolveRoleFromCode("bad-code")).toBeNull();
  });

  it("creates and validates signed session cookies", () => {
    const cookie = createSessionCookieValue("owner");
    expect(parseSessionCookieValue(cookie)).toBe("owner");
    expect(parseSessionCookieValue(`${cookie}tampered`)).toBeNull();
  });

  it("validates signed session cookies in edge-compatible auth", async () => {
    const cookie = createSessionCookieValue("viewer");
    await expect(parseEdgeSessionCookieValue(cookie)).resolves.toBe("viewer");
    await expect(parseEdgeSessionCookieValue(`${cookie}tampered`)).resolves.toBeNull();
  });
});

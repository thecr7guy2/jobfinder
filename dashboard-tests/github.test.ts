import { beforeEach, describe, expect, it, vi } from "vitest";

import { readRepoJsonFile, updateRepoJsonFile } from "@/lib/dashboard/github";

describe("github-backed json helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("GH_PAT", "token");
    vi.stubEnv("GH_REPO", "owner/repo");
    vi.stubEnv("GH_BRANCH", "main");
  });

  it("reads repo json content from the GitHub contents API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sha: "sha-1",
          content: Buffer.from(JSON.stringify({ "job-1": { status: "saved" } }), "utf-8").toString("base64"),
        }),
      }),
    );

    await expect(readRepoJsonFile("data/applications.json", {})).resolves.toEqual({
      "job-1": { status: "saved" },
    });
  });

  it("retries on concurrent sha conflicts and merges with latest remote state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sha: "sha-1",
          content: Buffer.from(JSON.stringify({ "job-9144": { status: "skipped" } }), "utf-8").toString("base64"),
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => "conflict",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sha: "sha-2",
          content: Buffer.from(
            JSON.stringify({
              "job-9144": { status: "skipped" },
              "job-9152": { status: "skipped" },
            }),
            "utf-8",
          ).toString("base64"),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "",
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await updateRepoJsonFile<Record<string, { status: string }>>({
      path: "data/applications.json",
      fallback: {},
      message: "update",
      apply: (current) => ({
        ...current,
        "job-9161": { status: "skipped" },
      }),
    });

    expect(result).toEqual({
      "job-9144": { status: "skipped" },
      "job-9152": { status: "skipped" },
      "job-9161": { status: "skipped" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

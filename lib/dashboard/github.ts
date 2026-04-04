type RepoInfo = {
  owner: string;
  repo: string;
  branch: string;
};

type RepoFile = {
  content: string;
  sha: string | null;
};

function repoInfo(): RepoInfo | null {
  const explicit = process.env.GH_REPO;
  if (explicit && explicit.includes("/")) {
    const [owner, repo] = explicit.split("/", 2);
    return {
      owner,
      repo,
      branch: process.env.GH_BRANCH || "main",
    };
  }

  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  if (owner && repo) {
    return {
      owner,
      repo,
      branch: process.env.GH_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "main",
    };
  }

  return null;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

function repoFileUrl(repo: RepoInfo, path: string): string {
  return `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${repo.branch}`;
}

function decodeBase64Content(content: string): string {
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf-8");
}

async function loadRepoFileInternal(path: string): Promise<RepoFile> {
  const token = process.env.GH_PAT;
  const repo = repoInfo();

  if (!token || !repo) {
    throw new Error("GitHub repo access is not configured.");
  }

  const response = await fetch(repoFileUrl(repo, path), {
    headers: githubHeaders(token),
    cache: "no-store",
  });

  if (response.status === 404) {
    return { content: "", sha: null };
  }

  if (!response.ok) {
    throw new Error(`Failed to load file metadata: ${response.status}`);
  }

  const payload = (await response.json()) as { content?: string; sha?: string };
  return {
    content: payload.content ? decodeBase64Content(payload.content) : "",
    sha: payload.sha ?? null,
  };
}

async function putRepoFile(params: {
  path: string;
  content: string;
  message: string;
  sha: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const token = process.env.GH_PAT;
  const repo = repoInfo();

  if (!token || !repo) {
    throw new Error("GitHub repo write-back is not configured.");
  }

  const response = await fetch(repoFileUrl(repo, params.path), {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message: params.message,
      content: Buffer.from(params.content, "utf-8").toString("base64"),
      branch: repo.branch,
      sha: params.sha ?? undefined,
    }),
  });

  if (response.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    status: response.status,
    body: await response.text(),
  };
}

export async function readRepoJsonFile<T>(path: string, fallback: T): Promise<T> {
  const file = await loadRepoFileInternal(path);
  if (!file.content.trim()) {
    return fallback;
  }
  return JSON.parse(file.content) as T;
}

export async function updateRepoJsonFile<T>(params: {
  path: string;
  fallback: T;
  message: string;
  apply: (current: T) => T;
  maxRetries?: number;
}): Promise<T> {
  const maxRetries = params.maxRetries ?? 3;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const file = await loadRepoFileInternal(params.path);
    const current = file.content.trim() ? (JSON.parse(file.content) as T) : params.fallback;
    const next = params.apply(current);
    const serialized = JSON.stringify(next, null, 2) + "\n";
    const writeResult = await putRepoFile({
      path: params.path,
      content: serialized,
      message: params.message,
      sha: file.sha,
    });

    if (writeResult.ok) {
      return next;
    }

    if (writeResult.status === 409 || writeResult.status === 422) {
      continue;
    }

    throw new Error(`Failed to write file via GitHub API: ${writeResult.status} ${writeResult.body}`);
  }

  throw new Error("Failed to write file via GitHub API after retrying concurrent updates.");
}

export async function updateRepoFile(params: {
  path: string;
  content: string;
  message: string;
}): Promise<void> {
  const result = await putRepoFile({
    path: params.path,
    content: params.content,
    message: params.message,
    sha: (await loadRepoFileInternal(params.path)).sha,
  });

  if (!result.ok) {
    throw new Error(`Failed to write file via GitHub API: ${result.status} ${result.body}`);
  }
}

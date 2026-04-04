type RepoInfo = {
  owner: string;
  repo: string;
  branch: string;
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

export async function updateRepoFile(params: {
  path: string;
  content: string;
  message: string;
}): Promise<void> {
  const token = process.env.GH_PAT;
  const repo = repoInfo();

  if (!token || !repo) {
    throw new Error("GitHub repo write-back is not configured.");
  }

  const fileUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${params.path}?ref=${repo.branch}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const existingResponse = await fetch(fileUrl, {
    headers,
    cache: "no-store",
  });

  let sha: string | undefined;
  if (existingResponse.status === 200) {
    const existingPayload = (await existingResponse.json()) as { sha?: string };
    sha = existingPayload.sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(`Failed to load file metadata: ${existingResponse.status}`);
  }

  const putResponse = await fetch(fileUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: params.message,
      content: Buffer.from(params.content, "utf-8").toString("base64"),
      branch: repo.branch,
      sha,
    }),
  });

  if (!putResponse.ok) {
    const body = await putResponse.text();
    throw new Error(`Failed to write file via GitHub API: ${putResponse.status} ${body}`);
  }
}

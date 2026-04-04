import { NextResponse } from "next/server";

import { getSessionRole } from "@/lib/dashboard/auth";
import { findJobById } from "@/lib/cover-letter/generate";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function POST(request: Request) {
  const role = await getSessionRole();
  if (role !== "owner") {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { jobId?: string } | null;
  const jobId = payload?.jobId?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    const job = await findJobById(jobId);
    if (!job) {
      return NextResponse.json({ error: `Unknown job id: ${jobId}` }, { status: 404 });
    }

    const repo = requiredEnv("GH_REPO");
    const token = requiredEnv("GH_PAT");
    const workflowId = process.env.COVER_LETTER_PDF_WORKFLOW_ID?.trim() || "cover_letter_pdf.yml";
    const ref = process.env.GH_BRANCH?.trim() || "main";

    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref,
          inputs: {
            job_id: jobId,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(errorPayload?.message || "Failed to trigger PDF workflow.");
    }

    return NextResponse.json({
      ok: true,
      workflowId,
      runUrl: `https://github.com/${repo}/actions/workflows/${workflowId}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to trigger PDF workflow." },
      { status: 400 },
    );
  }
}

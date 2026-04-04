import { NextResponse } from "next/server";

import { getSessionRole } from "@/lib/dashboard/auth";
import { findJobById, generateCoverLetter } from "@/lib/cover-letter/generate";

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

    const letter = await generateCoverLetter(job);
    return NextResponse.json({ ok: true, ...letter });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate cover letter." },
      { status: 400 },
    );
  }
}

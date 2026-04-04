import { NextResponse } from "next/server";

import { getSessionRole } from "@/lib/dashboard/auth";
import { assertValidStatus, updateApplicationStatus } from "@/lib/dashboard/data";

export async function POST(request: Request) {
  const role = await getSessionRole();
  if (role !== "owner") {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { jobId?: string; status?: string } | null;
  const jobId = payload?.jobId?.trim();
  const status = payload?.status?.trim();
  if (!jobId || !status) {
    return NextResponse.json({ error: "jobId and status are required." }, { status: 400 });
  }

  try {
    assertValidStatus(status);
    const record = await updateApplicationStatus({ jobId, status, role });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update status." },
      { status: 400 },
    );
  }
}

import { Buffer } from "node:buffer";

import { getSessionRole } from "@/lib/dashboard/auth";
import { readCoverLetterRecord } from "@/lib/dashboard/postgres";

export async function GET(request: Request) {
  const role = await getSessionRole();
  if (role !== "owner") {
    return Response.json({ error: "Owner access required." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim();
  if (!jobId) {
    return Response.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    const record = await readCoverLetterRecord(jobId);
    if (!record || !record.pdf_data || !record.pdf_filename) {
      return Response.json({ error: "No compiled PDF is available for this job yet." }, { status: 404 });
    }

    return new Response(Buffer.from(record.pdf_data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${record.pdf_filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load compiled PDF." },
      { status: 400 },
    );
  }
}

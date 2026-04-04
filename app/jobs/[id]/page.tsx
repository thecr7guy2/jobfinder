import { notFound } from "next/navigation";

import { JobDetailView } from "@/components/job-detail-view";
import { Shell } from "@/components/shell";
import { getSessionRole } from "@/lib/dashboard/auth";
import { getDashboardJobById } from "@/lib/dashboard/data";
import { readCoverLetterRecord } from "@/lib/dashboard/postgres";

type JobPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

function backTarget(from: string | undefined): { href: string; label: string } {
  if (from === "inbox") {
    return { href: "/inbox", label: "Back to Inbox" };
  }
  return { href: "/tracker", label: "Back to Tracker" };
}

export default async function JobPage({ params, searchParams }: JobPageProps) {
  const role = await getSessionRole();
  if (!role) {
    return null;
  }

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const jobId = decodeURIComponent(id);
  const [job, storedCoverLetter] = await Promise.all([
    getDashboardJobById(jobId),
    role === "owner" ? readCoverLetterRecord(jobId) : Promise.resolve(null),
  ]);
  if (!job) {
    notFound();
  }

  const back = backTarget(query.from);

  return (
    <Shell role={role} title="Job detail" subtitle={`${job.companyName} · ${job.applicationStatus}`}>
      <JobDetailView
        job={job}
        role={role}
        backHref={back.href}
        backLabel={back.label}
        initialCoverLetter={{
          status: storedCoverLetter ? "ready" : "idle",
          filename: storedCoverLetter?.filename ?? null,
          savedPath: null,
          savedMode: storedCoverLetter ? "postgres" : null,
          previewText: storedCoverLetter?.preview_text ?? null,
          hasPdf: Boolean(storedCoverLetter?.pdf_data && storedCoverLetter?.pdf_filename),
        }}
      />
    </Shell>
  );
}

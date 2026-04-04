import { notFound } from "next/navigation";

import { JobDetailView } from "@/components/job-detail-view";
import { Shell } from "@/components/shell";
import { getSessionRole } from "@/lib/dashboard/auth";
import { getDashboardJobById } from "@/lib/dashboard/data";

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
  const job = await getDashboardJobById(decodeURIComponent(id));
  if (!job) {
    notFound();
  }

  const back = backTarget(query.from);

  return (
    <Shell role={role} title="Job detail" subtitle={`${job.companyName} · ${job.applicationStatus}`}>
      <JobDetailView job={job} role={role} backHref={back.href} backLabel={back.label} />
    </Shell>
  );
}

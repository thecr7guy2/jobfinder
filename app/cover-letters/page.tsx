import { redirect } from "next/navigation";

import { CoverLettersView } from "@/components/cover-letters-view";
import { Shell } from "@/components/shell";
import { getSessionRole } from "@/lib/dashboard/auth";
import { getStoredCoverLetters } from "@/lib/dashboard/data";

type CoverLettersPageProps = {
  searchParams: Promise<{ job?: string }>;
};

export default async function CoverLettersPage({ searchParams }: CoverLettersPageProps) {
  const role = await getSessionRole();
  if (!role) {
    return null;
  }
  if (role !== "owner") {
    redirect("/inbox");
  }

  const [letters, query] = await Promise.all([getStoredCoverLetters(), searchParams]);
  const selectedJobId = query.job ? decodeURIComponent(query.job) : null;

  return (
    <Shell role={role} title="Cover Letters" subtitle="Stored drafts and compiled PDFs">
      <CoverLettersView letters={letters} selectedJobId={selectedJobId} />
    </Shell>
  );
}

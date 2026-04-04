import { JobsView } from "@/components/jobs-view";
import { Shell } from "@/components/shell";
import { getSessionRole } from "@/lib/dashboard/auth";
import { getDashboardViewModel } from "@/lib/dashboard/data";

export default async function InboxPage() {
  const role = await getSessionRole();
  const viewModel = await getDashboardViewModel();

  if (!role) {
    return null;
  }

  return (
    <Shell role={role} title="Inbox" subtitle="Unreviewed jobs scoring 70+">
      <JobsView
        title="Inbox"
        subtitle="Start with the strongest unreviewed matches, then open details in-place without losing context."
        jobs={viewModel.inboxJobs}
        role={role}
        mode="inbox"
      />
    </Shell>
  );
}

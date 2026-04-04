import { JobsView } from "@/components/jobs-view";
import { Shell } from "@/components/shell";
import { getSessionRole } from "@/lib/dashboard/auth";
import { getDashboardViewModel } from "@/lib/dashboard/data";

export default async function TrackerPage() {
  const role = await getSessionRole();
  const viewModel = await getDashboardViewModel();

  if (!role) {
    return null;
  }

  return (
    <Shell role={role} title="Tracker" subtitle="Every discovered job with live status controls">
      <JobsView
        title="Tracker"
        subtitle="Filter across the full pipeline, compare score against status, and keep your application motion visible."
        jobs={viewModel.trackerJobs}
        role={role}
        mode="tracker"
      />
    </Shell>
  );
}

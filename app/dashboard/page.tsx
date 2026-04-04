import { DashboardOverview } from "@/components/dashboard-overview";
import { Shell } from "@/components/shell";
import { getSessionRole } from "@/lib/dashboard/auth";
import { getDashboardViewModel } from "@/lib/dashboard/data";

export default async function DashboardPage() {
  const role = await getSessionRole();
  const viewModel = await getDashboardViewModel();

  if (!role) {
    return null;
  }

  return (
    <Shell role={role} title="Dashboard" subtitle="High-level view of pipeline health and application momentum">
      <DashboardOverview metrics={viewModel.metrics} />
    </Shell>
  );
}

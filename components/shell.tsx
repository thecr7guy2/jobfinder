import type { ReactNode } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import type { AccessRole } from "@/lib/dashboard/types";

type ShellProps = {
  role: AccessRole;
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function Shell({ role, title, subtitle, children }: ShellProps) {
  return (
    <div className="shell">
      <div className="frame">
        <header className="header">
          <div className="brand">
            <h1>JobFinder Dashboard</h1>
            <p>
              {title} · {subtitle}
            </p>
          </div>
          <DashboardNav role={role} />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

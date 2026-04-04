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
            <div className="brand-mark">JF</div>
            <div className="brand-text">
              <h1>JobFinder</h1>
              <p>
                {title} · {subtitle}
              </p>
            </div>
          </div>
          <DashboardNav role={role} />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

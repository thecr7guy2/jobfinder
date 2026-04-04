"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AccessRole } from "@/lib/dashboard/types";

type DashboardNavProps = {
  role: AccessRole;
};

const links = [
  { href: "/inbox", label: "Inbox" },
  { href: "/tracker", label: "Tracker" },
  { href: "/dashboard", label: "Dashboard" },
];

export function DashboardNav({ role }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <div className="nav">
      <span className="role-chip">{role === "owner" ? "Owner access" : "Viewer access"}</span>
      {links.map((link) => (
        <Link key={link.href} href={link.href} data-active={pathname === link.href}>
          {link.label}
        </Link>
      ))}
      <form action="/api/auth/logout" method="post">
        <button type="submit">Log out</button>
      </form>
    </div>
  );
}

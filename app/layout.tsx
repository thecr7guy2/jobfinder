import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "JobFinder Dashboard",
  description: "Protected dashboard for reviewing matched jobs and tracking applications.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

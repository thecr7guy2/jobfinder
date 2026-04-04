import { redirect } from "next/navigation";

import { getSessionRole } from "@/lib/dashboard/auth";

export default async function HomePage() {
  const role = await getSessionRole();
  redirect(role ? "/inbox" : "/login");
}

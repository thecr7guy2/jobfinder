import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getSessionRole } from "@/lib/dashboard/auth";

export default async function LoginPage() {
  const role = await getSessionRole();
  if (role) {
    redirect("/inbox");
  }

  return (
    <div className="login-shell">
      <section className="login-card">
        <h1>Enter JobFinder</h1>
        <p>
          Use the viewer code to browse the dashboard, or the owner code to change review status and keep the
          application tracker current.
        </p>
        <LoginForm />
      </section>
    </div>
  );
}

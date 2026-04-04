"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nextPath = searchParams.get("next") || "/inbox";
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error || "Access code rejected.");
      return;
    }

    startTransition(() => {
      router.push(nextPath);
      router.refresh();
    });
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      <input
        type="password"
        placeholder="Enter viewer or owner code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        autoFocus
      />
      {error ? <div className="error">{error}</div> : null}
      <div className="button-row">
        <button className="primary-button" type="submit" disabled={isPending || !code.trim()}>
          {isPending ? "Checking..." : "Enter dashboard"}
        </button>
      </div>
    </form>
  );
}

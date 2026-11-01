"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { t } from "@/lib/translations";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError("");
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch("/api/dashboard/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) {
        const body = await response.json() as { error?: { message?: string } };
        setError(body.error?.message ?? t.login.failed);
      } else { router.replace("/dashboard"); router.refresh(); }
    } catch { setError(t.login.failed); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit}><label><span>{t.login.password}</span><input name="password" type="password" autoComplete="current-password" required maxLength={72} /></label>
    <button disabled={pending}>{pending ? t.login.pending : t.login.submit}</button><p role="alert">{error}</p></form>;
}

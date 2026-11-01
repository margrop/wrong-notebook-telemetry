"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { t } from "@/lib/translations";

interface ErrorEditorProps { fingerprint: string; status: string; note: string | null }
export function ErrorEditor({ fingerprint, status, note }: ErrorEditorProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/dashboard/errors/${fingerprint}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: values.get("status"), note: values.get("note") || null }) });
      setMessage(response.ok ? t.controls.saved : t.controls.failed);
      if (response.ok) router.refresh();
    } catch { setMessage(t.controls.failed); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit}><div className="grid"><label><span>{t.errors.status}</span><select name="status" defaultValue={status}>
    <option value="open">{t.errors.open}</option><option value="ignored">{t.errors.ignored}</option><option value="fixed">{t.errors.fixed}</option>
  </select></label><label><span>{t.errors.note}</span><textarea name="note" maxLength={1000} defaultValue={note ?? ""} /></label></div>
    <button disabled={pending}>{pending ? t.controls.saving : t.controls.save}</button> <span role="status">{message}</span></form>;
}

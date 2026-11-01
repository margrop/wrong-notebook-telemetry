"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import type { ServiceSettings } from "@/lib/service-settings";
import { t } from "@/lib/translations";

interface ServiceSettingsFormProps { settings: ServiceSettings }
export function ServiceSettingsForm({ settings }: ServiceSettingsFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const list = (key: string) => String(form.get(key) ?? "").split(",").map(value => value.trim()).filter(Boolean);
    const pause = String(form.get("pausedUntil") ?? "");
    try {
      const response = await fetch("/api/dashboard/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        minIntervalSec: Number(form.get("minIntervalSec")), pausedUntil: pause ? new Date(pause).toISOString() : null,
        disabledVersions: list("disabledVersions"), disabledSchemas: list("disabledSchemas").map(Number),
      }) });
      setMessage(response.ok ? t.controls.saved : t.controls.failed);
      if (response.ok) router.refresh();
    } catch { setMessage(t.controls.failed); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit}>
    <label><span>{t.settings.interval}</span><input name="minIntervalSec" type="number" min={21600} max={604800} step={1} required defaultValue={settings.minIntervalSec} /></label>
    <label><span>{t.settings.pause}</span><input name="pausedUntil" type="text" placeholder="2026-11-02T00:00:00.000Z" defaultValue={settings.pausedUntil ?? ""} /></label>
    <label><span>{t.settings.versions}</span><input name="disabledVersions" type="text" defaultValue={settings.disabledVersions.join(",")} /></label>
    <label><span>{t.settings.schemas}</span><input name="disabledSchemas" type="text" defaultValue={settings.disabledSchemas.join(",")} /></label>
    <button disabled={pending}>{pending ? t.controls.saving : t.controls.save}</button> <span role="status">{message}</span>
  </form>;
}

import { ServiceSettingsForm } from "@/components/service-settings-form";
import { getDatabase } from "@/lib/prisma";
import { requireDashboard } from "@/lib/require-dashboard";
import { getServiceSettings } from "@/lib/service-settings";
import { t } from "@/lib/translations";

export default async function SettingsPage() {
  await requireDashboard();
  const settings = await getServiceSettings(getDatabase());
  return <section className="panel"><h1>{t.settings.title}</h1><p className="muted">{t.settings.notice}</p>
    <ServiceSettingsForm settings={settings} />
    <p className="notice">{t.settings.emergency}: INGEST_PAUSED={process.env.INGEST_PAUSED || "—"}; INGEST_DISABLED_VERSIONS={process.env.INGEST_DISABLED_VERSIONS || "—"}; INGEST_DISABLED_SCHEMAS={process.env.INGEST_DISABLED_SCHEMAS || "—"}</p>
  </section>;
}

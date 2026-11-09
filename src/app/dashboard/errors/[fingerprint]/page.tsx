import Link from "next/link";
import { notFound } from "next/navigation";
import { Bars, Trend } from "@/components/dashboard-charts";
import { ErrorEditor } from "@/components/error-editor";
import { getErrorDetailSnapshot, rangeSchema } from "@/lib/dashboard-data";
import { utcDay } from "@/lib/ingest-contract";
import { requireDashboard } from "@/lib/require-dashboard";
import { t } from "@/lib/translations";
import { fillDays } from "@/lib/trends";

interface ErrorDetailPageProps {
  params: Promise<{ fingerprint: string }>;
  searchParams: Promise<{ range?: string }>;
}

export default async function ErrorDetailPage({ params, searchParams }: ErrorDetailPageProps) {
  await requireDashboard();
  const { fingerprint } = await params;
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) notFound();
  const range = rangeSchema.safeParse((await searchParams).range).data ?? "30";
  const data = await getErrorDetailSnapshot(fingerprint, range, utcDay(new Date()));
  const error = data.error;
  if (!error) notFound();
  return <>
    <p><Link href={`/dashboard?range=${range}&status=${error.status}`}>{t.errors.back}</Link></p>
    <h1>{error.name} · <code>{error.fingerprint}</code></h1>
    <p>{error.kind} / {error.scope} · {t.errors.rangeCount}: {error.count} · {t.errors.total}: {error.total}</p>
    <p>{t.errors.first}: {error.firstSeenDay} ({error.firstVersion}) · {t.errors.last}: {error.lastSeenDay} ({error.lastVersion})</p>
    <p className="muted">{data.from} — {data.to}</p>
    <section className="panel"><h2>{t.errors.sampleMessage}</h2>
      {error.sampleMessage && <p><code>{error.sampleMessage}</code></p>}
      {error.sampleFrame && <p><strong>{t.errors.sampleFrame}</strong>: <code>{error.sampleFrame}</code></p>}
      {error.samplePath && <p><strong>{t.errors.samplePath}</strong>: <code>{error.samplePath}</code></p>}
      {error.samplePlatform && <p><strong>{t.errors.samplePlatform}</strong>: {error.samplePlatform}</p>}
      {error.sampleDigest && <p><strong>{t.errors.digest}</strong>: <code>{error.sampleDigest}</code></p>}
    </section>
    <section className="panel"><h2>{t.dashboard.errorTrend}</h2>
      <Trend label={t.dashboard.errorTrend} rows={fillDays(data.from, data.to, error.trend)} />
    </section>
    <div className="grid"><section className="panel"><h2>{t.errors.versionCounts}</h2><Bars rows={error.versions} /></section>
      <section className="panel"><h2>{t.errors.platformCounts}</h2><Bars rows={error.platforms} /></section></div>
    <section className="panel"><ErrorEditor fingerprint={error.fingerprint} status={error.status} note={error.note} /></section>
  </>;
}

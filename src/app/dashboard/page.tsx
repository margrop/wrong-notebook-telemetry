import Link from "next/link";
import { Bars, Trend } from "@/components/dashboard-charts";
import { ErrorEditor } from "@/components/error-editor";
import { errorStatusSchema, getDashboardSnapshot, rangeSchema } from "@/lib/dashboard-data";
import type { ErrorStatus } from "@/lib/dashboard-data";
import { utcDay } from "@/lib/ingest-contract";
import { requireDashboard } from "@/lib/require-dashboard";
import { t } from "@/lib/translations";
import { fillDays, findSpikes } from "@/lib/trends";

interface DashboardPageProps { searchParams: Promise<{ range?: string; status?: string }> }
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  await requireDashboard();
  const params = await searchParams;
  const range = rangeSchema.safeParse(params.range).data ?? "30";
  const status = errorStatusSchema.safeParse(params.status).data ?? "open";
  const data = await getDashboardSnapshot(range, utcDay(new Date()), status);
  const alive = fillDays(data.from, data.to, data.activity.filter(row => row.name === "instance_alive"));
  const spikes = findSpikes(alive);
  const installs = data.totals.find(row => row.name === "app_installed")?.count ?? 0;
  const errors = data.errorDays.reduce((sum, row) => sum + row.count, 0);
  const statuses: ErrorStatus[] = ["open", "ignored", "fixed", "all"];
  return <>
    <h1>{t.dashboard.title}</h1><p className="muted">{t.dashboard.privacy}</p>
    <nav className="range" aria-label={t.dashboard.range}>{["7", "30", "90", "400"].map(value => <Link key={value}
      href={`/dashboard?range=${value}&status=${status}`} aria-current={range === value ? "page" : undefined}>{value} {t.dashboard.days}</Link>)}</nav>
    <p className="muted">{data.from} — {data.to} · {t.dashboard.cached}</p>
    {data.quota.warning && <p className="warning">{t.dashboard.quotaWarning} {Math.round(data.quota.ratio * 100)}%</p>}
    {spikes.length > 0 && <p className="warning">{t.dashboard.spikes}: {spikes.join("、")}</p>}
    <div className="grid">
      <div className="card"><span>{t.dashboard.activeToday}</span><strong className="metric">{alive.at(-1)?.count.toLocaleString() ?? 0}</strong></div>
      <div className="card"><span>{t.dashboard.installs}</span><strong className="metric">{installs.toLocaleString()}</strong></div>
      <div className="card"><span>{t.dashboard.errors}</span><strong className="metric">{errors.toLocaleString()}</strong></div>
    </div>
    <section className="panel"><h2>{t.dashboard.activeTrend}</h2><p className="muted">{t.dashboard.activeNote}</p>
      <Trend rows={alive} label={t.dashboard.activeTrend} />
      <details><summary>{t.dashboard.dailyCounts}</summary><div className="table-scroll"><table><thead><tr><th>{t.columns.day}</th><th>{t.columns.count}</th></tr></thead>
        <tbody>{alive.map(row => <tr key={row.day}><td>{row.day}</td><td>{row.count}</td></tr>)}</tbody></table></div></details>
    </section>
    <div className="grid"><section className="panel"><h2>{t.dashboard.versionShare}</h2><Bars rows={data.versions} /></section>
      <section className="panel"><h2>{t.dashboard.platformShare}</h2><Bars rows={data.platforms} /></section></div>
    <section className="panel"><h2>{t.dashboard.features}</h2><div className="table-scroll"><table><thead><tr><th>{t.columns.event}</th><th>{t.columns.count}</th></tr></thead>
      <tbody>{data.totals.map(row => <tr key={row.name}><td><code>{row.name}</code></td><td>{row.count.toLocaleString()}</td></tr>)}</tbody></table></div>
      <details><summary>{t.dashboard.dimensions}</summary><div className="table-scroll"><table><thead><tr><th>{t.columns.event}</th><th>{t.columns.dimensions}</th><th>{t.columns.count}</th></tr></thead>
        <tbody>{data.dimensions.map(row => <tr key={JSON.stringify([row.name, row.payload])}><td><code>{row.name}</code></td><td><code>{row.payload}</code></td><td>{row.count}</td></tr>)}</tbody></table></div></details>
    </section>
    <section className="panel"><h2>{t.dashboard.ai}</h2><div className="table-scroll"><table><thead><tr><th>{t.columns.provider}</th><th>{t.columns.event}</th><th>{t.columns.successRate}</th><th>{t.columns.duration}</th></tr></thead>
      <tbody>{data.ai.map(row => <tr key={JSON.stringify([row.provider, row.event])}><td>{row.provider}</td><td><code>{row.event}</code></td>
        <td>{row.total ? (row.success / row.total * 100).toFixed(1) : 0}% ({row.success}/{row.total})</td><td>{Object.entries(row.durations).map(([duration, count]) => `${duration}: ${count}`).join(" · ") || "—"}</td></tr>)}</tbody></table></div>
    </section>
    <section className="panel"><h2>{t.dashboard.errors}</h2><Trend label={t.dashboard.errorTrend} rows={fillDays(data.from, data.to, data.errorDays)} />
      <nav className="range" aria-label={t.errors.filter}>{statuses.map(value => <Link key={value}
        href={`/dashboard?range=${range}&status=${value}`} aria-current={status === value ? "page" : undefined}>{t.errors[value]}</Link>)}</nav>
      <p className="muted">{t.errors.limit}</p>{!data.errors.length && <p>{t.dashboard.empty}</p>}
      {data.errors.map(error => <article key={error.fingerprint} className="error-entry">
        <h3><Link href={`/dashboard/errors/${error.fingerprint}?range=${range}`}>{error.name}</Link> · <code>{error.fingerprint}</code></h3>
        <p>{error.kind} / {error.scope} · {t.errors.rangeCount}: {error.count} · {t.errors.total}: {error.total}</p>
        <p>{t.errors.first}: {error.firstSeenDay} ({error.firstVersion}) · {t.errors.last}: {error.lastSeenDay} ({error.lastVersion})</p>
        <p>{t.errors.platformCounts}: {error.platforms.map(row => `${row.label} ${row.count}`).join(" · ") || "—"}</p>
        {error.sampleMessage && <p><strong>{t.errors.sampleMessage}</strong>: <code>{error.sampleMessage}</code></p>}
        {error.sampleFrame && <p><strong>{t.errors.sampleFrame}</strong>: <code>{error.sampleFrame}</code></p>}
        {error.samplePath && <p><strong>{t.errors.samplePath}</strong>: <code>{error.samplePath}</code> · {t.errors.samplePlatform}: {error.samplePlatform ?? "—"}</p>}
        {error.sampleDigest && <p><strong>{t.errors.digest}</strong>: <code>{error.sampleDigest}</code></p>}
        <details><summary>{t.dashboard.dailyCounts}</summary><p>{error.trend.map(row => `${row.day}: ${row.count}`).join(" · ")}</p></details>
        <ErrorEditor fingerprint={error.fingerprint} status={error.status} note={error.note} />
      </article>)}
    </section>
    <section className="panel"><h2>{t.dashboard.usage}</h2><p>{t.dashboard.monthlyBatches}: {data.monthlyBatches.toLocaleString()} · {t.dashboard.monthlyItems}: {data.monthlyItems.toLocaleString()} · {t.dashboard.rejected}: {data.monthlyRejected.toLocaleString()}</p>
      <p>{t.dashboard.snapshot}: {data.usage?.day ?? "—"} · {t.dashboard.eventRows}: {data.usage?.eventRows ?? "—"} · {t.dashboard.errorRows}: {data.usage?.errorRows ?? "—"} · {t.dashboard.fingerprintRows}: {data.usage?.fingerprintRows ?? "—"} · {t.dashboard.bytes}: {data.usage?.databaseBytes ?? "—"}</p>
      <p className="muted">{t.dashboard.usageNote}</p>
    </section>
  </>;
}

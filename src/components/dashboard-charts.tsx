import { t } from "@/lib/translations";

interface BarsProps { rows: Array<{ label: string; count: number }> }
export function Bars({ rows }: BarsProps) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.length ? <div className="bars">{rows.map(row => <div key={row.label}>
    <div className="bar-label"><span>{row.label}</span><span>{row.count.toLocaleString()} · {total ? (row.count / total * 100).toFixed(1) : 0}%</span></div>
    <div className="bar-track"><div className="bar-fill" style={{ width: `${total ? row.count / total * 100 : 0}%` }} /></div>
  </div>)}</div> : <p className="muted">{t.dashboard.empty}</p>;
}

interface TrendProps { rows: Array<{ day: string; count: number }>; label: string }
export function Trend({ rows, label }: TrendProps) {
  const max = Math.max(1, ...rows.map(row => row.count));
  return <div className="trend" role="img" aria-label={label}>{rows.map(row => <div className="trend-day" key={row.day}
    style={{ height: `${Math.max(row.count ? 1 : 0, row.count / max * 100)}%` }} title={`${row.day}: ${row.count}`} />)}</div>;
}

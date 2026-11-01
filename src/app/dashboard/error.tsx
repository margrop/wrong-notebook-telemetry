"use client";
import { t } from "@/lib/translations";

export default function DashboardError({ reset }: { reset: () => void }) {
  return <section className="panel"><h1>{t.dashboard.unavailable}</h1><p>{t.dashboard.retryNote}</p><button onClick={reset}>{t.dashboard.retry}</button></section>;
}

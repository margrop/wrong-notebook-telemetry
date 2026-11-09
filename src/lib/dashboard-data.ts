import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import type { ErrorFingerprint, PrismaClient } from "@prisma/client";
import { shiftDay, utcDay } from "@/lib/ingest-contract";
import { quotaDecision, readQuotaBudgets } from "@/lib/maintenance";
import { getDatabase } from "@/lib/prisma";
import { getServiceSettings } from "@/lib/service-settings";

export const rangeSchema = z.enum(["7", "30", "90", "400"]);
export const errorStatusSchema = z.enum(["open", "ignored", "fixed", "all"]);
export type DashboardRange = z.infer<typeof rangeSchema>;
export type ErrorStatus = z.infer<typeof errorStatusSchema>;
const aiEvents = ["ai_analyze_result", "ai_reanswer"];
export async function loadDashboard(db: PrismaClient, range: DashboardRange, now = new Date(), status: ErrorStatus = "open") {
  const to = utcDay(now);
  const from = shiftDay(to, -(Number(range) - 1));
  const where = { day: { gte: from, lte: to } };
  const [totals, activity, versions, dimensions, aiDimensions, errorDays, usage, month, settings] = await Promise.all([
    db.dailyEvent.groupBy({ by: ["name"], where, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } }),
    db.dailyEvent.groupBy({ by: ["day", "name"], where: { ...where, name: { in: ["instance_alive", "app_installed"] } }, _sum: { count: true }, orderBy: { day: "asc" } }),
    db.dailyEvent.groupBy({ by: ["version"], where: { ...where, name: "instance_alive" }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } }),
    db.dailyEvent.groupBy({ by: ["name", "payloadKey"], where, _sum: { count: true }, orderBy: { _sum: { count: "desc" } }, take: 500 }),
    db.dailyEvent.groupBy({ by: ["name", "payloadKey"], where: { ...where, name: { in: aiEvents } }, _sum: { count: true } }),
    db.dailyError.groupBy({ by: ["day"], where, _sum: { count: true }, orderBy: { day: "asc" } }),
    db.dailyUsage.findMany({ orderBy: { day: "desc" }, take: 1 }),
    db.dailyUsage.aggregate({ where: { day: { gte: `${to.slice(0, 7)}-01`, lte: to } }, _sum: { batches: true, items: true, rejected: true } }),
    getServiceSettings(db),
  ]);
  // 先按人工状态取指纹，再聚合期间计数，避免已修复/忽略的错误占满前 100 名
  const matching = await db.errorFingerprint.findMany({
    where: status === "all" ? {} : { status }, select: { fingerprint: true }, orderBy: { lastSeenDay: "desc" }, take: 500,
  });
  const candidates = matching.map(row => row.fingerprint);
  const topErrors = candidates.length ? await db.dailyError.groupBy({
    by: ["fingerprint"], where: { ...where, fingerprint: { in: candidates } },
    _sum: { count: true }, orderBy: { _sum: { count: "desc" } }, take: 100,
  }) : [];
  const fingerprints = topErrors.map(row => row.fingerprint);
  const [metadata, errorTrend, errorPlatforms, platforms] = await Promise.all([
    db.errorFingerprint.findMany({ where: { fingerprint: { in: fingerprints } } }),
    db.dailyError.groupBy({ by: ["fingerprint", "day"], where: { ...where, fingerprint: { in: fingerprints } }, _sum: { count: true }, orderBy: { day: "asc" } }),
    db.dailyError.groupBy({ by: ["fingerprint", "platform"], where: { ...where, fingerprint: { in: fingerprints } }, _sum: { count: true } }),
    db.dailyEvent.groupBy({ by: ["payloadKey"], where: { ...where, name: "instance_alive" }, _sum: { count: true } }),
  ]);
  const latest = usage[0];
  const quota = quotaDecision({ monthlyBatches: month._sum.batches ?? 0,
    storageRows: (latest?.eventRows ?? 0) + (latest?.errorRows ?? 0) + (latest?.fingerprintRows ?? 0),
    databaseBytes: Number(latest?.databaseBytes ?? 0) }, readQuotaBudgets(), settings.minIntervalSec);
  return {
    from, to, status, totals: totals.map(row => ({ name: row.name, count: row._sum.count ?? 0 })),
    activity: activity.map(row => ({ day: row.day, name: row.name, count: row._sum.count ?? 0 })),
    versions: versions.map(row => ({ label: row.version, count: row._sum.count ?? 0 })),
    dimensions: dimensions.map(row => ({ name: row.name, payload: row.payloadKey, count: row._sum.count ?? 0 })),
    platforms: sumPlatforms(platforms), ai: summarizeAi(aiDimensions),
    errorDays: errorDays.map(row => ({ day: row.day, count: row._sum.count ?? 0 })),
    errors: topErrors.flatMap(row => {
      const info = metadata.find(item => item.fingerprint === row.fingerprint);
      return info ? [{ ...info, count: row._sum.count ?? 0,
        platforms: errorPlatforms.filter(item => item.fingerprint === row.fingerprint)
          .map(item => ({ label: item.platform, count: item._sum.count ?? 0 })).sort((a, b) => b.count - a.count),
        trend: errorTrend.filter(item => item.fingerprint === row.fingerprint)
          .map(item => ({ day: item.day, count: item._sum.count ?? 0 })) }] : [];
    }),
    usage: latest ? { ...latest, databaseBytes: latest.databaseBytes?.toString() ?? null } : null,
    monthlyBatches: month._sum.batches ?? 0, monthlyItems: month._sum.items ?? 0, monthlyRejected: month._sum.rejected ?? 0,
    quota,
  };
}

interface Dimension { name: string; payloadKey: string; _sum: { count: number | null } }
export function summarizeAi(rows: Dimension[]) {
  const groups = new Map<string, { provider: string; event: string; success: number; total: number; durations: Record<string, number> }>();
  for (const row of rows) {
    const payload = JSON.parse(row.payloadKey) as Record<string, unknown>;
    const provider = typeof payload.provider === "string" ? payload.provider : "unknown";
    const key = JSON.stringify([provider, row.name]);
    const value = groups.get(key) ?? { provider, event: row.name, success: 0, total: 0, durations: {} };
    const count = row._sum.count ?? 0;
    value.total += count;
    if (payload.ok === true) value.success += count;
    if (typeof payload.duration === "string") value.durations[payload.duration] = (value.durations[payload.duration] ?? 0) + count;
    groups.set(key, value);
  }
  return [...groups.values()];
}

function sumPlatforms(rows: Array<{ payloadKey: string; _sum: { count: number | null } }>) {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const payload = JSON.parse(row.payloadKey) as Record<string, unknown>;
    const platform = typeof payload.platform === "string" ? payload.platform : "other";
    groups.set(platform, (groups.get(platform) ?? 0) + (row._sum.count ?? 0));
  }
  return [...groups].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export const getDashboardSnapshot = unstable_cache(
  async (range: DashboardRange, day: string, status: ErrorStatus) =>
    loadDashboard(getDatabase(), range, new Date(`${day}T12:00:00.000Z`), status),
  ["telemetry-dashboard-v2"], { revalidate: 300, tags: ["telemetry-dashboard"] },
);
export type DashboardSnapshot = Awaited<ReturnType<typeof loadDashboard>>;

export interface ErrorDetailError extends ErrorFingerprint {
  count: number;
  trend: Array<{ day: string; count: number }>;
  versions: Array<{ label: string; count: number }>;
  platforms: Array<{ label: string; count: number }>;
}
export interface ErrorDetailSnapshot { from: string; to: string; error: ErrorDetailError | null }

/** 单个错误指纹的详情：首次/最近、样本、按天/版本/部署形态趋势 */
export async function loadErrorDetail(
  db: PrismaClient, fingerprint: string, range: DashboardRange, now = new Date(),
): Promise<ErrorDetailSnapshot> {
  const to = utcDay(now);
  const from = shiftDay(to, -(Number(range) - 1));
  const where = { fingerprint, day: { gte: from, lte: to } };
  const [info, trend, versions, platforms] = await Promise.all([
    db.errorFingerprint.findUnique({ where: { fingerprint } }),
    db.dailyError.groupBy({ by: ["day"], where, _sum: { count: true }, orderBy: { day: "asc" } }),
    db.dailyError.groupBy({ by: ["version"], where, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } }),
    db.dailyError.groupBy({ by: ["platform"], where, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } }),
  ]);
  return {
    from, to,
    error: info ? {
      ...info,
      count: trend.reduce((sum, row) => sum + (row._sum.count ?? 0), 0),
      trend: trend.map(row => ({ day: row.day, count: row._sum.count ?? 0 })),
      versions: versions.map(row => ({ label: row.version, count: row._sum.count ?? 0 })),
      platforms: platforms.map(row => ({ label: row.platform, count: row._sum.count ?? 0 })),
    } : null,
  };
}

export const getErrorDetailSnapshot = unstable_cache(
  async (fingerprint: string, range: DashboardRange, day: string): Promise<ErrorDetailSnapshot> =>
    loadErrorDetail(getDatabase(), fingerprint, range, new Date(`${day}T12:00:00.000Z`)),
  ["telemetry-error-detail-v1"], { revalidate: 300, tags: ["telemetry-dashboard"] },
);

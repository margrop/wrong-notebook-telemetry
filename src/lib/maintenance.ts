import "server-only";
import type { PrismaClient } from "@prisma/client";
import { shiftDay, utcDay } from "@/lib/ingest-contract";
import { DEFAULT_INTERVAL_SEC, getServiceSettings, invalidateSettings } from "@/lib/service-settings";

export const RETENTION_DAYS = 400;
export interface QuotaBudgets { monthlyBatches?: number; storageRows?: number; databaseBytes?: number; warningRatio: number }

function positiveNumber(value: string | undefined): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function readQuotaBudgets(): QuotaBudgets {
  const warningRatio = positiveNumber(process.env.QUOTA_WARNING_RATIO) ?? 0.7;
  return { monthlyBatches: positiveNumber(process.env.MONTHLY_BATCH_BUDGET), storageRows: positiveNumber(process.env.STORAGE_ROW_BUDGET),
    databaseBytes: positiveNumber(process.env.DATABASE_BYTE_BUDGET), warningRatio: Math.min(1, warningRatio) };
}

export function quotaDecision(input: { monthlyBatches: number; storageRows: number; databaseBytes: number }, budgets: QuotaBudgets, current: number) {
  const ratios = [
    budgets.monthlyBatches ? input.monthlyBatches / budgets.monthlyBatches : 0,
    budgets.storageRows ? input.storageRows / budgets.storageRows : 0,
    budgets.databaseBytes ? input.databaseBytes / budgets.databaseBytes : 0,
  ];
  const ratio = Math.max(...ratios);
  const warning = ratio >= budgets.warningRatio;
  const proposed = ratio >= 0.9 ? 86_400 : warning ? 43_200 : DEFAULT_INTERVAL_SEC;
  return { ratio, warning, minIntervalSec: Math.max(current, proposed) };
}

export async function maintain(db: PrismaClient, now = new Date(), budgets = readQuotaBudgets()) {
  const today = utcDay(now);
  const cutoff = shiftDay(today, -(RETENTION_DAYS - 1));
  const deleted = await db.$transaction(async tx => ({
    events: (await tx.dailyEvent.deleteMany({ where: { day: { lt: cutoff } } })).count,
    errors: (await tx.dailyError.deleteMany({ where: { day: { lt: cutoff } } })).count,
    fingerprints: (await tx.errorFingerprint.deleteMany({ where: { lastSeenDay: { lt: cutoff } } })).count,
    usage: (await tx.dailyUsage.deleteMany({ where: { day: { lt: cutoff } } })).count,
  }));
  const [eventRows, errorRows, fingerprintRows, pages, sizes, monthUsage, settings] = await Promise.all([
    db.dailyEvent.count(), db.dailyError.count(), db.errorFingerprint.count(),
    db.$queryRaw<Array<{ page_count: bigint }>>`PRAGMA page_count`,
    db.$queryRaw<Array<{ page_size: bigint }>>`PRAGMA page_size`,
    db.dailyUsage.aggregate({ where: { day: { gte: `${today.slice(0, 7)}-01`, lte: today } }, _sum: { batches: true } }),
    getServiceSettings(db),
  ]);
  const databaseBytes = BigInt(pages[0]?.page_count ?? 0) * BigInt(sizes[0]?.page_size ?? 0);
  await db.dailyUsage.upsert({
    where: { day: today }, create: { day: today, eventRows, errorRows, fingerprintRows, databaseBytes },
    update: { eventRows, errorRows, fingerprintRows, databaseBytes },
  });
  const quota = quotaDecision({ monthlyBatches: monthUsage._sum.batches ?? 0,
    storageRows: eventRows + errorRows + fingerprintRows, databaseBytes: Number(databaseBytes) }, budgets, settings.minIntervalSec);
  // 维护只自动调大间隔；并发管理员设置也不能被陈旧缓存覆盖为更小的值。
  if (quota.warning) {
    await db.$executeRaw`
      INSERT INTO "ServiceSetting" ("key", "value", "updatedAt")
      VALUES ('minIntervalSec', ${String(quota.minIntervalSec)}, ${now})
      ON CONFLICT ("key") DO UPDATE SET "value" = CAST(MAX(CAST("value" AS INTEGER), ${quota.minIntervalSec}) AS TEXT), "updatedAt" = ${now}`;
    invalidateSettings(db);
  }
  return { cutoff, deleted, rows: { events: eventRows, errors: errorRows, fingerprints: fingerprintRows },
    databaseBytes: databaseBytes.toString(), quota };
}

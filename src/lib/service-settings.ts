import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { VERSION_PATTERN } from "@/lib/ingest-contract";

export const DEFAULT_INTERVAL_SEC = 6 * 60 * 60;
export const settingsSchema = z.strictObject({
  minIntervalSec: z.number().int().min(DEFAULT_INTERVAL_SEC).max(7 * 86_400),
  pausedUntil: z.iso.datetime().nullable(),
  disabledVersions: z.array(z.string().regex(VERSION_PATTERN)).max(100),
  disabledSchemas: z.array(z.number().int().nonnegative().max(1000)).max(20),
});
export type ServiceSettings = z.infer<typeof settingsSchema>;

const defaults: ServiceSettings = {
  minIntervalSec: DEFAULT_INTERVAL_SEC, pausedUntil: null, disabledVersions: [], disabledSchemas: [],
};
const cache = new WeakMap<PrismaClient, { value: ServiceSettings; expires: number }>();
const inFlight = new WeakMap<PrismaClient, Promise<ServiceSettings>>();

export async function getServiceSettings(db: PrismaClient, now = Date.now()): Promise<ServiceSettings> {
  const cached = cache.get(db);
  if (cached && cached.expires > now) return cached.value;
  const pending = inFlight.get(db);
  if (pending) return pending;
  const load = (async () => {
    const rows = await db.serviceSetting.findMany({ where: { key: { in: Object.keys(defaults) } } });
    const values: Record<string, unknown> = { ...defaults };
    for (const row of rows) values[row.key] = JSON.parse(row.value) as unknown;
    // 异常设置使请求失败并重试，不静默恢复外发。
    const parsed = settingsSchema.parse(values);
    cache.set(db, { value: parsed, expires: now + 300_000 });
    return parsed;
  })();
  inFlight.set(db, load);
  try { return await load; } finally { inFlight.delete(db); }
}

export function invalidateSettings(db: PrismaClient): void { cache.delete(db); }

export async function saveServiceSettings(db: PrismaClient, settings: ServiceSettings): Promise<void> {
  const parsed = settingsSchema.parse(settings);
  await db.$transaction(Object.entries(parsed).map(([key, value]) => db.serviceSetting.upsert({
    where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) },
  })));
  invalidateSettings(db);
}

function commaList(value: string | undefined): string[] {
  return (value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

export function effectiveIngestControl(settings: ServiceSettings, schema: number, version: string, now = new Date()) {
  const disabled = settings.disabledVersions.includes(version) || commaList(process.env.INGEST_DISABLED_VERSIONS).includes(version)
    || settings.disabledSchemas.includes(schema) || commaList(process.env.INGEST_DISABLED_SCHEMAS).includes(String(schema));
  const persistedPause = settings.pausedUntil !== null && Date.parse(settings.pausedUntil) > now.getTime();
  const emergency = process.env.INGEST_PAUSED;
  const paused = emergency === "true" || (emergency !== "false" && persistedPause);
  const pauseSeconds = emergency === "true" ? 3600 : Math.ceil((Date.parse(settings.pausedUntil ?? "") - now.getTime()) / 1000);
  return { disabled, paused, retryAfterSec: paused ? Math.min(7 * 86_400, Math.max(60, pauseSeconds)) : undefined };
}

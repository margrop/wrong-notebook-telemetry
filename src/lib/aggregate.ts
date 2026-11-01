import "server-only";
import type { PrismaClient } from "@prisma/client";
import { canonicalPayload, utcDay } from "@/lib/ingest-contract";
import type { ErrorItem, IngestItem } from "@/lib/ingest-contract";

interface EventGroup { day: string; version: string; name: string; payloadKey: string; count: number }
interface ErrorGroup { day: string; version: string; fingerprint: string; count: number }
interface FingerprintGroup extends Omit<ErrorItem, "t" | "day"> {
  firstSeenDay: string; lastSeenDay: string; version: string; count: number;
}

export function groupItems(items: IngestItem[], version: string) {
  const events = new Map<string, EventGroup>();
  const errors = new Map<string, ErrorGroup>();
  const fingerprints = new Map<string, FingerprintGroup>();
  for (const item of items) {
    if (item.t === "event") {
      const payloadKey = canonicalPayload(item.payload);
      const key = JSON.stringify([item.day, version, item.name, payloadKey]);
      const group = events.get(key);
      if (group) group.count += 1;
      else events.set(key, { day: item.day, version, name: item.name, payloadKey, count: 1 });
    } else {
      const key = JSON.stringify([item.day, version, item.fingerprint]);
      const group = errors.get(key);
      if (group) group.count += 1;
      else errors.set(key, { day: item.day, version, fingerprint: item.fingerprint, count: 1 });
      const fingerprint = fingerprints.get(item.fingerprint);
      if (fingerprint) {
        fingerprint.count += 1;
        if (item.day < fingerprint.firstSeenDay) fingerprint.firstSeenDay = item.day;
        if (item.day > fingerprint.lastSeenDay) fingerprint.lastSeenDay = item.day;
      } else {
        fingerprints.set(item.fingerprint, { fingerprint: item.fingerprint, kind: item.kind, scope: item.scope,
          name: item.name, firstSeenDay: item.day, lastSeenDay: item.day, version, count: 1 });
      }
    }
  }
  return { events: [...events.values()], errors: [...errors.values()], fingerprints: [...fingerprints.values()] };
}

export async function aggregateBatch(db: PrismaClient, version: string, items: IngestItem[], rejected: number, now = new Date()): Promise<void> {
  const groups = groupItems(items, version);
  await db.$transaction(async tx => {
    for (const group of groups.events) {
      await tx.dailyEvent.upsert({
        where: { day_version_name_payloadKey: { day: group.day, version, name: group.name, payloadKey: group.payloadKey } },
        create: group, update: { count: { increment: group.count } },
      });
    }
    for (const group of groups.errors) {
      await tx.dailyError.upsert({
        where: { day_version_fingerprint: { day: group.day, version, fingerprint: group.fingerprint } },
        create: group, update: { count: { increment: group.count } },
      });
    }
    for (const group of groups.fingerprints) {
      // 单条参数化 upsert 保证乱序/并发批次不会倒退首次、最近出现的日期和版本。
      await tx.$executeRaw`
        INSERT INTO "ErrorFingerprint"
          ("fingerprint", "kind", "scope", "name", "firstSeenDay", "firstVersion", "lastSeenDay", "lastVersion", "total", "status")
        VALUES (${group.fingerprint}, ${group.kind}, ${group.scope}, ${group.name}, ${group.firstSeenDay}, ${version},
          ${group.lastSeenDay}, ${version}, ${group.count}, 'open')
        ON CONFLICT ("fingerprint") DO UPDATE SET
          "firstVersion" = CASE WHEN excluded."firstSeenDay" < "firstSeenDay" THEN excluded."firstVersion" ELSE "firstVersion" END,
          "lastVersion" = CASE WHEN excluded."lastSeenDay" > "lastSeenDay" THEN excluded."lastVersion" ELSE "lastVersion" END,
          "firstSeenDay" = MIN("firstSeenDay", excluded."firstSeenDay"),
          "lastSeenDay" = MAX("lastSeenDay", excluded."lastSeenDay"),
          "total" = "total" + excluded."total"`;
    }
    const day = utcDay(now);
    await tx.dailyUsage.upsert({
      where: { day }, create: { day, batches: 1, items: items.length, rejected },
      update: { batches: { increment: 1 }, items: { increment: items.length }, rejected: { increment: rejected } },
    });
  }, { timeout: 8000 });
}

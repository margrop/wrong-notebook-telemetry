import "server-only";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { canonicalPayload, utcDay } from "@/lib/ingest-contract";
import type { IngestItem } from "@/lib/ingest-contract";

interface EventGroup { day: string; version: string; name: string; payloadKey: string; count: number }
interface ErrorGroup { day: string; version: string; platform: string; fingerprint: string; count: number }
interface FingerprintGroup {
  fingerprint: string; kind: string; scope: string; name: string;
  sampleMessage?: string; sampleFrame?: string; samplePath?: string; sampleDigest?: string; samplePlatform: string;
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
      const platform = item.platform ?? "other";
      const key = JSON.stringify([item.day, version, platform, item.fingerprint]);
      const group = errors.get(key);
      if (group) group.count += 1;
      else errors.set(key, { day: item.day, version, platform, fingerprint: item.fingerprint, count: 1 });
      const fingerprint = fingerprints.get(item.fingerprint);
      if (fingerprint) {
        fingerprint.count += 1;
        if (item.day < fingerprint.firstSeenDay) fingerprint.firstSeenDay = item.day;
        if (item.day > fingerprint.lastSeenDay) fingerprint.lastSeenDay = item.day;
        fingerprint.sampleMessage ??= item.message;
        fingerprint.sampleFrame ??= item.frame;
        fingerprint.samplePath ??= item.path;
        fingerprint.sampleDigest ??= item.digest;
      } else {
        fingerprints.set(item.fingerprint, { fingerprint: item.fingerprint, kind: item.kind, scope: item.scope,
          name: item.name, firstSeenDay: item.day, lastSeenDay: item.day, version, count: 1,
          samplePlatform: platform, sampleMessage: item.message, sampleFrame: item.frame,
          samplePath: item.path, sampleDigest: item.digest });
      }
    }
  }
  return { events: [...events.values()], errors: [...errors.values()], fingerprints: [...fingerprints.values()] };
}

export async function aggregateBatch(db: PrismaClient, version: string, items: IngestItem[], rejected: number, now = new Date()): Promise<void> {
  const groups = groupItems(items, version);
  await db.$transaction(async tx => {
    if (groups.events.length) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DailyEvent" ("day", "version", "name", "payloadKey", "count") VALUES
        ${Prisma.join(groups.events.map(group => Prisma.sql`(${group.day}, ${version}, ${group.name}, ${group.payloadKey}, ${group.count})`))}
        ON CONFLICT ("day", "version", "name", "payloadKey") DO UPDATE SET "count" = "count" + excluded."count"`);
    }
    if (groups.errors.length) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DailyError" ("day", "version", "platform", "fingerprint", "count") VALUES
        ${Prisma.join(groups.errors.map(group => Prisma.sql`(${group.day}, ${version}, ${group.platform}, ${group.fingerprint}, ${group.count})`))}
        ON CONFLICT ("day", "version", "platform", "fingerprint") DO UPDATE SET "count" = "count" + excluded."count"`);
    }
    if (groups.fingerprints.length) {
      // 每表一条多行 upsert，避免最大批次产生上百次 Turso 网络往返。
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ErrorFingerprint"
          ("fingerprint", "kind", "scope", "name", "firstSeenDay", "firstVersion", "lastSeenDay", "lastVersion", "total", "status",
           "sampleMessage", "sampleFrame", "samplePath", "samplePlatform", "sampleDigest")
        VALUES ${Prisma.join(groups.fingerprints.map(group => Prisma.sql`(
          ${group.fingerprint}, ${group.kind}, ${group.scope}, ${group.name}, ${group.firstSeenDay}, ${version},
          ${group.lastSeenDay}, ${version}, ${group.count}, 'open',
          ${group.sampleMessage ?? null}, ${group.sampleFrame ?? null}, ${group.samplePath ?? null},
          ${group.samplePlatform}, ${group.sampleDigest ?? null})`))}
        ON CONFLICT ("fingerprint") DO UPDATE SET
          "firstVersion" = CASE WHEN excluded."firstSeenDay" < "firstSeenDay" THEN excluded."firstVersion" ELSE "firstVersion" END,
          "lastVersion" = CASE WHEN excluded."lastSeenDay" > "lastSeenDay" THEN excluded."lastVersion" ELSE "lastVersion" END,
          "firstSeenDay" = MIN("firstSeenDay", excluded."firstSeenDay"),
          "lastSeenDay" = MAX("lastSeenDay", excluded."lastSeenDay"),
          "total" = "total" + excluded."total",
          "sampleMessage" = COALESCE("sampleMessage", excluded."sampleMessage"),
          "sampleFrame" = COALESCE("sampleFrame", excluded."sampleFrame"),
          "samplePath" = COALESCE("samplePath", excluded."samplePath"),
          "samplePlatform" = COALESCE("samplePlatform", excluded."samplePlatform"),
          "sampleDigest" = COALESCE("sampleDigest", excluded."sampleDigest")`);
    }
    const day = utcDay(now);
    await tx.$executeRaw`
      INSERT INTO "DailyUsage" ("day", "batches", "items", "rejected") VALUES (${day}, 1, ${items.length}, ${rejected})
      ON CONFLICT ("day") DO UPDATE SET "batches" = "batches" + 1,
        "items" = "items" + excluded."items", "rejected" = "rejected" + excluded."rejected"`;
  }, { timeout: 8000 });
}

import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { temporaryDatabase } from "../helpers/database";
import { createMaintainHandler } from "@/lib/cron";
import { maintain } from "@/lib/maintenance";
import { invalidateSettings } from "@/lib/service-settings";

let database: Awaited<ReturnType<typeof temporaryDatabase>>;
const now = new Date("2026-11-01T12:00:00Z");
beforeAll(async () => { database = await temporaryDatabase(); });
afterAll(async () => { await database?.dispose(); });
beforeEach(async () => {
  await database.db.$transaction([
    database.db.dailyEvent.deleteMany(), database.db.dailyError.deleteMany(), database.db.errorFingerprint.deleteMany(),
    database.db.dailyUsage.deleteMany(), database.db.serviceSetting.deleteMany(),
  ]); invalidateSettings(database.db);
});
afterEach(() => vi.unstubAllEnvs());

describe("维护与私有统计查询", () => {
  it("保留今天及之前399天的边界，清除全部更早的日表和陈旧指纹", async () => {
    for (const [day, fingerprint] of [["2025-09-27", "a".repeat(16)], ["2025-09-28", "b".repeat(16)]]) {
      await database.db.dailyEvent.create({ data: { day, version: "v1", name: "app_opened", payloadKey: "{}", count: 2 } });
      await database.db.dailyError.create({ data: { day, version: "v1", fingerprint, count: 1 } });
      await database.db.errorFingerprint.create({ data: { fingerprint, kind: "server", scope: "api:ai", name: "Error", firstSeenDay: day, lastSeenDay: day, firstVersion: "v1", lastVersion: "v1", total: 1 } });
      await database.db.dailyUsage.create({ data: { day, batches: 1 } });
    }
    const result = await maintain(database.db, now, { warningRatio: 0.7 });
    expect(result.cutoff).toBe("2025-09-28");
    expect(result.deleted).toEqual({ events: 1, errors: 1, fingerprints: 1, usage: 1 });
    expect(await database.db.dailyEvent.findMany()).toMatchObject([{ day: "2025-09-28" }]);
    expect(await database.db.dailyUsage.findUnique({ where: { day: "2026-11-01" } })).toMatchObject({ eventRows: 1, errorRows: 1, fingerprintRows: 1 });
    expect(BigInt(result.databaseBytes)).toBeGreaterThan(0n);
    const again = await maintain(database.db, now, { warningRatio: 0.7 });
    expect(again.deleted).toEqual({ events: 0, errors: 0, fingerprints: 0, usage: 0 });
  });
  it("预算达到70%后下发12小时，90%后24小时，重复执行不降低", async () => {
    await database.db.dailyUsage.create({ data: { day: "2026-11-01", batches: 70 } });
    const budgets = { warningRatio: 0.7, monthlyBatches: 100 };
    expect((await maintain(database.db, now, budgets)).quota.minIntervalSec).toBe(43200);
    await database.db.dailyUsage.update({ where: { day: "2026-11-01" }, data: { batches: 90 } });
    expect((await maintain(database.db, now, budgets)).quota.minIntervalSec).toBe(86400);
    await database.db.dailyUsage.update({ where: { day: "2026-11-01" }, data: { batches: 0 } });
    expect((await maintain(database.db, now, budgets)).quota.minIntervalSec).toBe(86400);
  });
  it("cron 需要强凭据，不接受缺省、查询参数或错误授权", async () => {
    let accessed = 0;
    const get = createMaintainHandler(() => { accessed++; return database.db; }, () => now);
    vi.stubEnv("CRON_SECRET", "");
    expect((await get(new Request("http://localhost/api/cron/maintain"))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "c".repeat(40));
    expect((await get(new Request(`http://localhost/api/cron/maintain?secret=${"c".repeat(40)}`))).status).toBe(401);
    expect(accessed).toBe(0);
    const response = await get(new Request("http://localhost/api/cron/maintain", { headers: { authorization: `Bearer ${"c".repeat(40)}` } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, rows: { events: 0 } });
  });
  it("Vercel 每日维护使用 UTC 定时配置", async () => {
    const config = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8")) as { crons: unknown[] };
    expect(config.crons).toEqual([{ path: "/api/cron/maintain", schedule: "17 3 * * *" }]);
  });
});

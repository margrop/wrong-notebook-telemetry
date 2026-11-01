import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { temporaryDatabase } from "../helpers/database";
import vectors from "../fixtures/contract-v1.json";
import { createIngestHandler } from "@/lib/ingest";
import { RateLimiter } from "@/lib/rate-limit";
import { invalidateSettings, saveServiceSettings } from "@/lib/service-settings";

let database: Awaited<ReturnType<typeof temporaryDatabase>>;
const now = new Date("2026-11-01T12:00:00.000Z");
const event = { t: "event", day: "2026-11-01", name: "ai_analyze_result", payload: { provider: "openai", ok: true, duration: "3-10s" } };
const settings = { minIntervalSec: 21600, pausedUntil: null, disabledVersions: [], disabledSchemas: [] };
const envelope = (items: unknown[] = [event]) => ({ schema: 1, app: "wrong-notebook", version: "2026.11.1", items });
const request = (body: unknown, headers?: HeadersInit) => new Request("http://localhost/api/v1/ingest", { method: "POST",
  headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const handler = (limit = 1000) => createIngestHandler({ getDb: () => database.db, limiter: new RateLimiter(limit, 60_000), now: () => now });

beforeAll(async () => { database = await temporaryDatabase(); });
afterAll(async () => { await database?.dispose(); });
beforeEach(async () => {
  await database.db.$transaction([
    database.db.dailyEvent.deleteMany(), database.db.dailyError.deleteMany(), database.db.errorFingerprint.deleteMany(),
    database.db.dailyUsage.deleteMany(), database.db.serviceSetting.deleteMany(),
  ]);
  invalidateSettings(database.db);
});
afterEach(() => vi.unstubAllEnvs());

describe("真实 libSQL 收集接口", () => {
  it("接受完整契约并只保存聚合字段，不保存身份或原始错误", async () => {
    const response = await handler()(request(vectors));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: vectors.items.length, rejected: 0, minIntervalSec: 21600 });
    expect(await database.db.dailyEvent.count()).toBe(14);
    expect(await database.db.dailyError.count()).toBe(3);
    const columns = await database.client.execute('PRAGMA table_info("ErrorFingerprint")');
    const names = columns.rows.map(row => row.name);
    for (const forbidden of ["message", "stack", "ip", "userId", "instanceId", "path", "userAgent"]) expect(names).not.toContain(forbidden);
    expect(await database.db.dailyUsage.findFirst()).toMatchObject({ batches: 1, items: 17, rejected: 0, day: "2026-11-01" });
  });
  it("批内合并和后续批次原子累加", async () => {
    const post = handler();
    await post(request(envelope([event, { ...event, payload: { ok: true, duration: "3-10s", provider: "openai" } }])));
    await Promise.all(Array.from({ length: 8 }, () => post(request(envelope()))));
    expect(await database.db.dailyEvent.findMany()).toMatchObject([{ count: 10, payloadKey: '{"duration":"3-10s","ok":true,"provider":"openai"}' }]);
    expect(await database.db.dailyUsage.findFirst()).toMatchObject({ batches: 9, items: 10 });
  });
  it("合法条目入库，非法条目拒收，整批成功避免无限重发", async () => {
    const response = await handler()(request(envelope([event, { ...event, message: "private" }, { ...event, payload: { text: "私密题目" } }, null])));
    expect(await response.json()).toMatchObject({ accepted: 1, rejected: 3 });
    expect(await database.db.dailyEvent.findFirst()).toMatchObject({ count: 1 });
    expect(await database.db.dailyUsage.findFirst()).toMatchObject({ items: 1, rejected: 3 });
  });
  it("全批条目非法也确认成功并记录拒收计数", async () => {
    const response = await handler()(request(envelope([null])));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: 0, rejected: 1 });
    expect(await database.db.dailyEvent.count()).toBe(0);
  });
  it("拒绝整体错误、Origin、错误媒体类型和超过限制的请求", async () => {
    const post = handler();
    expect((await post(request({ ...envelope(), userId: "private" }))).status).toBe(400);
    expect((await post(request(envelope(), { origin: "null" }))).status).toBe(403);
    expect((await post(request(envelope(), { "content-type": "text/plain" }))).status).toBe(415);
    expect((await post(request(envelope(), { "content-encoding": "gzip" }))).status).toBe(415);
    expect((await post(request(envelope(), { "content-length": "65537" }))).status).toBe(413);
    expect((await post(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status).toBe(400);
    expect(await database.db.dailyUsage.count()).toBe(0);
  });
  it("流式读取按实际 UTF-8 字节计数，不依赖 Content-Length", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ text: "中".repeat(22_000) }));
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes.slice(0, 40_000)); controller.enqueue(bytes.slice(40_000)); },
      cancel() { cancelled = true; },
    });
    const streamed = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: stream, duplex: "half" } as RequestInit);
    expect((await handler()(streamed)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(await database.db.dailyEvent.count()).toBe(0);
  });
  it("无可信 IP 时每分钟共享十次，返回 Retry-After，无 CORS", async () => {
    vi.stubEnv("VERCEL", ""); vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const post = handler(10);
    for (let index = 0; index < 10; index++) expect((await post(request(envelope(), { "x-forwarded-for": `192.0.2.${index + 1}` }))).status).toBe(200);
    const response = await post(request(envelope()));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("停用协议或版本返回 410；暂停时不写入", async () => {
    const post = handler();
    expect((await post(request({ ...envelope(), schema: 2 }))).status).toBe(410);
    await saveServiceSettings(database.db, { ...settings, disabledVersions: ["2026.11.1"] });
    expect((await post(request(envelope()))).status).toBe(410);
    await saveServiceSettings(database.db, { ...settings, disabledSchemas: [1] });
    expect((await post(request(envelope()))).status).toBe(410);
    await saveServiceSettings(database.db, { ...settings, minIntervalSec: 43200, pausedUntil: "2026-11-01T13:00:00Z" });
    expect(await (await post(request(envelope()))).json()).toEqual({ accepted: 0, rejected: 1, retryAfterSec: 3600, minIntervalSec: 43200 });
    expect(await database.db.dailyUsage.count()).toBe(0);
  });
  it("乱序错误不会倒退首次和最近日期，人工状态不被上报覆盖", async () => {
    const post = handler();
    const error = vectors.items[14];
    const send = (day: string, version: string) => post(request({ ...envelope([{ ...error, day }]), version }));
    await send("2026-10-30", "2026.10.30");
    await database.db.errorFingerprint.update({ where: { fingerprint: "a1b2c3d4e5f60718" }, data: { status: "fixed", note: "issue-1" } });
    await send("2026-11-01", "2026.11.1");
    await send("2026-10-25", "2026.10.25");
    expect(await database.db.errorFingerprint.findFirst()).toMatchObject({ total: 3, firstSeenDay: "2026-10-25", firstVersion: "2026.10.25",
      lastSeenDay: "2026-11-01", lastVersion: "2026.11.1", status: "fixed", note: "issue-1" });
  });
  it("事务后段失败时事件、错误、指纹和用量一起回滚", async () => {
    await database.client.executeMultiple('CREATE TRIGGER "fail_usage" BEFORE INSERT ON "DailyUsage" BEGIN SELECT RAISE(ABORT, \'test failure\'); END;');
    try {
      expect((await handler()(request(envelope([event, vectors.items[14]])))).status).toBe(503);
      expect(await database.db.dailyEvent.count()).toBe(0);
      expect(await database.db.dailyError.count()).toBe(0);
      expect(await database.db.errorFingerprint.count()).toBe(0);
      expect(await database.db.dailyUsage.count()).toBe(0);
    } finally { await database.client.execute('DROP TRIGGER "fail_usage"'); }
  });
});

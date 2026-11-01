import { afterEach, describe, expect, it, vi } from "vitest";
import { groupItems } from "@/lib/aggregate";
import { summarizeAi } from "@/lib/dashboard-data";
import { effectiveIngestControl, settingsSchema } from "@/lib/service-settings";
import { quotaDecision } from "@/lib/maintenance";
import { fillDays, findSpikes } from "@/lib/trends";

const settings = { minIntervalSec: 21600, pausedUntil: null, disabledVersions: [], disabledSchemas: [] };
afterEach(() => vi.unstubAllEnvs());

describe("聚合与服务策略", () => {
  it("相同主键合并，键顺序不增加分组", () => {
    const result = groupItems([
      { t: "event", day: "2026-11-01", name: "ai_reanswer", payload: { ok: true, provider: "openai" } },
      { t: "event", day: "2026-11-01", name: "ai_reanswer", payload: { provider: "openai", ok: true } },
    ], "2026.11.1");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].count).toBe(2);
  });
  it("应急停用取并集，暂停环境值优先", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    vi.stubEnv("INGEST_DISABLED_VERSIONS", "old, legacy");
    expect(effectiveIngestControl(settings, 1, "old", now).disabled).toBe(true);
    vi.stubEnv("INGEST_PAUSED", "true");
    expect(effectiveIngestControl(settings, 1, "current", now)).toMatchObject({ paused: true, retryAfterSec: 3600 });
    vi.stubEnv("INGEST_PAUSED", "false");
    expect(effectiveIngestControl({ ...settings, pausedUntil: "2026-11-02T00:00:00Z" }, 1, "current", now).paused).toBe(false);
  });
  it("发送间隔不得小于六小时或超出七天", () => {
    expect(settingsSchema.safeParse({ ...settings, minIntervalSec: 21599 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...settings, minIntervalSec: 604801 }).success).toBe(false);
  });
  it("配置预算后到阈值升至十二/二十四小时，自动策略不降低间隔", () => {
    const budgets = { monthlyBatches: 100, warningRatio: 0.7 };
    const value = { monthlyBatches: 70, storageRows: 0, databaseBytes: 0 };
    expect(quotaDecision(value, budgets, 21600)).toMatchObject({ warning: true, minIntervalSec: 43200 });
    expect(quotaDecision({ ...value, monthlyBatches: 90 }, budgets, 21600).minIntervalSec).toBe(86400);
    expect(quotaDecision({ ...value, monthlyBatches: 0 }, budgets, 86400).minIntervalSec).toBe(86400);
    expect(quotaDecision(value, { warningRatio: 0.7 }, 21600).warning).toBe(false);
  });
  it("AI 指标使用成功布尔值和耗时桶", () => {
    expect(summarizeAi([
      { name: "ai_analyze_result", payloadKey: '{"ok":true,"provider":"openai","duration":"<3s"}', _sum: { count: 3 } },
      { name: "ai_analyze_result", payloadKey: '{"ok":false,"provider":"openai","duration":">30s"}', _sum: { count: 1 } },
    ])).toEqual([{ event: "ai_analyze_result", provider: "openai", success: 3, total: 4, durations: { "<3s": 3, ">30s": 1 } }]);
  });
  it("补齐日期并标出高于前七日均值三倍的尖峰", () => {
    const rows = fillDays("2026-10-25", "2026-11-01", [{ day: "2026-11-01", count: 10 }]);
    expect(rows).toHaveLength(8);
    expect(findSpikes(rows)).toEqual(["2026-11-01"]);
  });
});

import { describe, expect, it } from "vitest";
import v1 from "../fixtures/contract-v1.json";
import v2 from "../fixtures/contract-v2.json";
import { canonicalPayload, envelopeSchema, itemSchema, validateItems } from "@/lib/ingest-contract";

const now = new Date("2026-11-01T23:59:59.000Z");
const event = { t: "event", day: "2026-11-01", name: "future_feature", payload: { enabled: true } };

describe("上报协议 v1/v2", () => {
  it("接受 v1 与 v2 的全部事件、错误样例及未来事件名", () => {
    for (const vectors of [v1, v2]) {
      expect(envelopeSchema.safeParse(vectors).success).toBe(true);
      expect(validateItems(vectors.items, now)).toMatchObject({ rejected: 0 });
    }
    expect(itemSchema(now).safeParse(event).success).toBe(true);
  });

  it.each(["2026-10-25", "2026-11-02"])("接受 UTC 日期边界 %s", day => {
    expect(itemSchema(now).safeParse({ ...event, day }).success).toBe(true);
  });
  it.each(["2026-10-24", "2026-11-03", "2026-02-30", "2026-11-1", "2026-11-01T00:00:00Z"])("拒绝越界或伪造日期 %s", day => {
    expect(itemSchema(now).safeParse({ ...event, day }).success).toBe(false);
  });
  it.each([
    { message: "不应保存的错误原文" }, { userId: "user123" }, { stack: "at private" },
  ])("拒绝事件上的额外字段 %j", extra => {
    expect(itemSchema(now).safeParse({ ...event, ...extra }).success).toBe(false);
  });
  it.each(["user@example.com", "有中文内容", "contains spaces", "https://host/path", "x".repeat(33), 1, {}, null])("拒绝事件维度中的自由文本或非枚举形状 %j", value => {
    expect(itemSchema(now).safeParse({ ...event, payload: { value } }).success).toBe(false);
  });
  it("拒绝超过八个维度以及原型保留字段", () => {
    expect(itemSchema(now).safeParse({ ...event, payload: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`key_${index}`, true])) }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...event, payload: JSON.parse('{"constructor":true}') }).success).toBe(false);
  });
  it("错误条目只允许预定字段与固定形状", () => {
    const error = v1.items[14];
    expect(itemSchema(now).safeParse({ ...error, fingerprint: "A1b2c3d4e5f60718" }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...error, kind: "unknown" }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...error, scope: "private error text" }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...error, stack: "at private" }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...error, userAgent: "private" }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...error, message: "Failed to fetch", frame: "at handler (/src/app/api/exams/route.ts)",
      path: "/exams/:id", platform: "docker", digest: "a1b2c3d4" }).success).toBe(true);
  });
  it("错误摘要拒绝控制字符、过长文本与未知部署形态", () => {
    const error = v2.items[14];
    expect(itemSchema(now).safeParse({ ...error, message: "bad\u0000text" }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...error, message: "x".repeat(201) }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...error, platform: "mars" }).success).toBe(false);
    expect(itemSchema(now).safeParse({ ...error, path: "/has space" }).success).toBe(false);
  });
  it("整体限制批量大小、版本、应用和额外身份字段", () => {
    for (const change of [{ items: [] }, { items: Array(101).fill(event) }, { app: "other" }, { version: "private version text" }, { instanceId: "ignored" }]) {
      expect(envelopeSchema.safeParse({ ...v1, ...change }).success).toBe(false);
    }
  });
  it("规范化键序并统一缺省与空维度", () => {
    expect(canonicalPayload({ provider: "openai", ok: true })).toBe('{"ok":true,"provider":"openai"}');
    expect(canonicalPayload({ ok: true, provider: "openai" })).toBe(canonicalPayload({ provider: "openai", ok: true }));
    expect(canonicalPayload()).toBe("{}");
    expect(canonicalPayload({})).toBe("{}");
  });
  it("部分非法条目不使整批失败", () => {
    expect(validateItems([event, { ...event, payload: { private: "private text" } }, null], now)).toEqual({ accepted: [event], rejected: 2 });
  });
});

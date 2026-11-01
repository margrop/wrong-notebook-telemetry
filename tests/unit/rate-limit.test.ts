import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter, requestRateKey } from "@/lib/rate-limit";

afterEach(() => vi.unstubAllEnvs());
describe("内存限流", () => {
  it("每个来源限制十次，并按窗口恢复", () => {
    const limiter = new RateLimiter(10, 60_000);
    for (let index = 0; index < 10; index++) expect(limiter.hit("source", 1000).allowed).toBe(true);
    expect(limiter.hit("source", 2000)).toEqual({ allowed: false, retryAfterSec: 59 });
    expect(limiter.hit("other", 2000).allowed).toBe(true);
    expect(limiter.hit("source", 61_000).allowed).toBe(true);
  });
  it("达到容量时拒绝新来源，过期后回收", () => {
    const limiter = new RateLimiter(1, 60_000, 1);
    expect(limiter.hit("a", 0).allowed).toBe(true);
    expect(limiter.hit("b", 100).allowed).toBe(false);
    expect(limiter.hit("a", 200).allowed).toBe(false);
    expect(limiter.hit("b", 60_000).allowed).toBe(true);
  });
  it("默认不信任可伪造的代理头，未知来源共用桶", () => {
    vi.stubEnv("VERCEL", ""); vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const a = new Request("http://localhost", { headers: { "x-forwarded-for": "192.0.2.1" } });
    const b = new Request("http://localhost", { headers: { "x-forwarded-for": "192.0.2.2" } });
    expect(requestRateKey(a)).toBe(requestRateKey(b));
    expect(requestRateKey(a)).not.toContain("192.0.2");
  });
  it("Vercel 只采用平台清洗的来源头，且仅保留摘要", () => {
    vi.stubEnv("VERCEL", "1");
    const a = new Request("http://localhost", { headers: { "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "192.0.2.9" } });
    const b = new Request("http://localhost", { headers: { "x-vercel-forwarded-for": "192.0.2.2" } });
    expect(requestRateKey(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(requestRateKey(a)).not.toBe(requestRateKey(b));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardSession, getAuthConfig, sessionCookie, verifyDashboardSession } from "@/lib/dashboard-auth";

afterEach(() => vi.unstubAllEnvs());
const config = { secret: "s".repeat(40), passwordHash: "test-hash-context" };
const now = Date.parse("2026-11-01T00:00:00Z");

describe("看板会话", () => {
  it("签名会话七天过期，拒绝篡改和跨密钥重放", () => {
    const token = createDashboardSession(config, now);
    expect(verifyDashboardSession(token, config, now)).toBe(true);
    expect(verifyDashboardSession(token, config, now + 7 * 86_400_000)).toBe(false);
    expect(verifyDashboardSession(`${token.slice(0, -1)}!`, config, now)).toBe(false);
    expect(verifyDashboardSession(token, { ...config, secret: "other" }, now)).toBe(false);
    expect(verifyDashboardSession(token, { ...config, passwordHash: "changed" }, now)).toBe(false);
  });
  it("凭据缺失或签名格式异常时关闭访问", () => {
    vi.stubEnv("DASHBOARD_PASSWORD_HASH", ""); vi.stubEnv("DASHBOARD_SESSION_SECRET", "");
    expect(getAuthConfig()).toBeUndefined();
    for (const token of [undefined, "", "v1.NaN.bad.bad", "a".repeat(300)]) expect(verifyDashboardSession(token, config, now)).toBe(false);
  });
  it("生产 Cookie 使用 Host 前缀、HttpOnly、Secure、严格 SameSite", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie("test")).toBe("__Host-wn-telemetry=test; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure");
    expect(sessionCookie("", 0)).toContain("Max-Age=0");
  });
});

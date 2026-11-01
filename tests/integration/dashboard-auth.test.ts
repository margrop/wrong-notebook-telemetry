import { hash } from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { temporaryDatabase } from "../helpers/database";
import { createErrorHandler, createSettingsHandler, login, logout } from "@/lib/dashboard-api";
import { createDashboardSession, getAuthConfig, requestIsAuthenticated, sessionCookieName } from "@/lib/dashboard-auth";
import { loginLimiter, requestRateKey } from "@/lib/rate-limit";

let database: Awaited<ReturnType<typeof temporaryDatabase>>;
let passwordHash: string;
const password = "local-test-password";
const settings = { minIntervalSec: 43200, pausedUntil: null, disabledVersions: ["old"], disabledSchemas: [] };
beforeAll(async () => { database = await temporaryDatabase(); passwordHash = await hash(password, 10); });
afterAll(async () => { await database?.dispose(); });
beforeEach(() => {
  vi.stubEnv("DASHBOARD_PASSWORD_HASH", passwordHash);
  vi.stubEnv("DASHBOARD_SESSION_SECRET", "s".repeat(40));
  vi.stubEnv("VERCEL", ""); vi.stubEnv("TRUST_PROXY_HEADERS", "false");
  loginLimiter.reset(requestRateKey(new Request("http://localhost")));
});
afterEach(() => vi.unstubAllEnvs());

function request(path: string, body: unknown, token?: string, origin: string | null = "http://localhost") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin !== null) headers.origin = origin;
  if (token) headers.cookie = `${sessionCookieName()}=${token}`;
  return new Request(`http://localhost${path}`, { method: path.endsWith("login") ? "POST" : "PATCH", headers, body: JSON.stringify(body) });
}
function session() { return createDashboardSession(getAuthConfig()!); }

describe("维护者鉴权与写接口", () => {
  it("正确密码建立会话，错误密码不写 Cookie，退出清空 Cookie", async () => {
    const denied = await login(request("/api/dashboard/login", { password: "wrong" }));
    expect(denied.status).toBe(401);
    expect(denied.headers.has("set-cookie")).toBe(false);
    const response = await login(request("/api/dashboard/login", { password }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Strict");
    expect(requestIsAuthenticated(new Request("http://localhost", { headers: { cookie } }))).toBe(true);
    const exited = await logout(request("/api/dashboard/logout", {}));
    expect(exited.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("五次失败后限流，携带退避秒数", async () => {
    for (let index = 0; index < 5; index++) expect((await login(request("/api/dashboard/login", { password: "wrong" }))).status).toBe(401);
    const response = await login(request("/api/dashboard/login", { password }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("登录和登出都要求同源 Origin，配置缺失时拒绝访问", async () => {
    expect((await login(request("/api/dashboard/login", { password }, undefined, "https://attacker.invalid"))).status).toBe(403);
    expect((await logout(request("/api/dashboard/logout", {}, undefined, null))).status).toBe(403);
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "short");
    expect((await login(request("/api/dashboard/login", { password }))).status).toBe(503);
    expect(requestIsAuthenticated(request("/", {}, "invalid"))).toBe(false);
  });
  it("服务控制拒绝匿名、跨站、篡改会话、非法设置", async () => {
    let writes = 0;
    const patch = createSettingsHandler(() => { writes++; return database.db; });
    expect((await patch(request("/api/dashboard/settings", settings))).status).toBe(401);
    expect((await patch(request("/api/dashboard/settings", settings, "invalid"))).status).toBe(401);
    expect((await patch(request("/api/dashboard/settings", settings, session(), "https://attacker.invalid"))).status).toBe(403);
    expect((await patch(request("/api/dashboard/settings", { ...settings, minIntervalSec: 1 }, session()))).status).toBe(400);
    expect(writes).toBe(0);
    expect((await patch(request("/api/dashboard/settings", settings, session()))).status).toBe(200);
    expect(await database.db.serviceSetting.findUnique({ where: { key: "minIntervalSec" } })).toMatchObject({ value: "43200" });
  });
  it("错误状态和备注可更新，未知指纹返回404，非法值和未知字段返回400", async () => {
    const fingerprint = "a".repeat(16);
    const patch = createErrorHandler(() => database.db);
    expect((await patch(request("/api/dashboard/errors", {}, session()), fingerprint)).status).toBe(400);
    expect((await patch(request("/api/dashboard/errors", { status: "fixed", note: null }, session()), fingerprint)).status).toBe(404);
    await database.db.errorFingerprint.create({ data: { fingerprint, kind: "server", scope: "api:ai", name: "TypeError", firstSeenDay: "2026-11-01", firstVersion: "v1", lastSeenDay: "2026-11-01", lastVersion: "v1" } });
    expect((await patch(request("/api/dashboard/errors", { status: "fixed", note: "issue-12" }, session()), fingerprint)).status).toBe(200);
    expect(await database.db.errorFingerprint.findUnique({ where: { fingerprint } })).toMatchObject({ status: "fixed", note: "issue-12" });
    expect((await patch(request("/api/dashboard/errors", { status: "unknown", note: null }, session()), fingerprint)).status).toBe(400);
    expect((await patch(request("/api/dashboard/errors", { status: "fixed", note: null, userId: "private" }, session()), fingerprint)).status).toBe(400);
  });
});

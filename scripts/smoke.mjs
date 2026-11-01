import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@libsql/client";
import { hash } from "bcryptjs";

const directory = await mkdtemp(join(tmpdir(), "wrong-notebook-telemetry-http-"));
const probe = createServer();
await new Promise((done, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", done); });
const port = probe.address().port;
await new Promise(done => probe.close(done));
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString("base64url");
const cronSecret = randomBytes(32).toString("hex");
const env = { ...process.env, NODE_ENV: "production", VERCEL: "", TURSO_DATABASE_URL: `file:${join(directory, "test.db")}`,
  TURSO_AUTH_TOKEN: "", DASHBOARD_PASSWORD_HASH: await hash(password, 10), DASHBOARD_SESSION_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: cronSecret, INGEST_PAUSED: "", INGEST_DISABLED_VERSIONS: "", INGEST_DISABLED_SCHEMAS: "", TRUST_PROXY_HEADERS: "false",
  MONTHLY_BATCH_BUDGET: "", STORAGE_ROW_BUDGET: "", DATABASE_BYTE_BUDGET: "" };
let child;
let client;
try {
  await promisify(execFile)(resolve("node_modules/.bin/tsx"), ["scripts/migrate.ts"], { env });
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: "ignore" });
  for (let index = 0; index < 200; index++) {
    if (child.exitCode !== null) throw new Error("生产服务器提前退出");
    try { const ready = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) }); if (ready.ok) break; }
    catch { /* 服务器启动期间继续探测。 */ }
    if (index === 199) throw new Error("生产服务器启动超时");
    await delay(150);
  }
  const health = await fetch(`${base}/api/v1/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", schema: 1 });
  for (const path of ["/dashboard", "/dashboard/settings"]) {
    const denied = await fetch(`${base}${path}`, { redirect: "manual" });
    assert.equal(denied.status, 307);
    assert.equal(denied.headers.get("location"), "/login");
  }
  assert.equal((await fetch(`${base}/privacy`)).status, 200);
  const post = (path, body, cookie, method = "POST") => fetch(`${base}${path}`, { method, headers: {
    "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify(body) });
  const loggedIn = await post("/api/dashboard/login", { password });
  assert.equal(loggedIn.status, 200);
  const cookieHeader = loggedIn.headers.get("set-cookie");
  assert.match(cookieHeader, /__Host-wn-telemetry=.*HttpOnly.*SameSite=Strict.*Secure/);
  const cookie = cookieHeader.split(";")[0];
  const day = new Date().toISOString().slice(0, 10);
  const body = { schema: 1, app: "wrong-notebook", version: "2026.11.1", items: [
    { t: "event", day, name: "instance_alive", payload: { platform: "docker", aiConfigured: true } },
    { t: "event", day, name: "ai_analyze_result", payload: { ok: true, provider: "openai", duration: "3-10s" } },
    { t: "error", day, kind: "server", scope: "api:ai", name: "TypeError", fingerprint: "a1b2c3d4e5f60718" },
    { t: "error", day, kind: "server", scope: "api:ai", name: "TypeError", fingerprint: "a1b2c3d4e5f60718", message: "private" },
  ] };
  const ingested = await fetch(`${base}/api/v1/ingest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(ingested.status, 200);
  assert.deepEqual(await ingested.json(), { accepted: 3, rejected: 1, minIntervalSec: 21600 });
  const dashboard = await fetch(`${base}/dashboard`, { headers: { Cookie: cookie } });
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert.ok(html.includes("openai") && html.includes("a1b2c3d4e5f60718"));
  assert.equal((await post("/api/dashboard/errors/a1b2c3d4e5f60718", { status: "fixed", note: "smoke-issue" }, cookie, "PATCH")).status, 200);
  assert.equal((await post("/api/dashboard/settings", { minIntervalSec: 43200, pausedUntil: null, disabledVersions: [], disabledSchemas: [] }, cookie, "PATCH")).status, 200);
  const maintained = await fetch(`${base}/api/cron/maintain`, { headers: { Authorization: `Bearer ${cronSecret}` } });
  assert.equal(maintained.status, 200);
  assert.equal((await maintained.json()).ok, true);
  client = createClient({ url: env.TURSO_DATABASE_URL });
  assert.equal((await client.execute('SELECT SUM("count") AS total FROM "DailyEvent"')).rows[0].total, 2);
  assert.equal((await client.execute('SELECT "status" FROM "ErrorFingerprint"')).rows[0].status, "fixed");
  assert.equal((await client.execute('SELECT "value" FROM "ServiceSetting" WHERE "key" = \'minIntervalSec\'')).rows[0].value, "43200");
  assert.equal((await post("/api/dashboard/logout", {}, cookie)).status, 200);
  process.stdout.write("生产 HTTP 冒烟通过：健康检查、私有页面保护、登录、上报聚合、看板、错误标记、服务设置、维护和退出。\n");
} finally {
  client?.close();
  if (child && child.exitCode === null) {
    const exited = new Promise(done => child.once("exit", done));
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
  }
  await rm(directory, { recursive: true, force: true });
}

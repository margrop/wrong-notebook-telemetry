import { describe, expect, it } from "vitest";
import { temporaryDatabase } from "../helpers/database";
import { loadDashboard, loadErrorDetail } from "@/lib/dashboard-data";

describe("私有统计查询", () => {
  it("使用 UTC 范围与聚合计数，版本和形态按实例天数计算", async () => {
    const database = await temporaryDatabase();
    try {
      await database.db.dailyEvent.createMany({ data: [
        { day: "2026-11-01", version: "v1", name: "instance_alive", payloadKey: '{"platform":"docker","aiConfigured":true}', count: 5 },
        { day: "2026-11-01", version: "v1", name: "app_installed", payloadKey: "{}", count: 2 },
        { day: "2026-10-01", version: "v0", name: "instance_alive", payloadKey: '{"platform":"npm"}', count: 99 },
      ] });
      const snapshot = await loadDashboard(database.db, "7", new Date("2026-11-01T12:00:00Z"));
      expect(snapshot.from).toBe("2026-10-26");
      expect(snapshot.versions).toEqual([{ label: "v1", count: 5 }]);
      expect(snapshot.platforms).toEqual([{ label: "docker", count: 5 }]);
      expect(snapshot.totals).toContainEqual({ name: "app_installed", count: 2 });
    } finally { await database.dispose(); }
  });

  it("按状态筛选错误，展示首次样本、部署形态分布与单指纹详情", async () => {
    const database = await temporaryDatabase();
    try {
      await database.db.errorFingerprint.create({ data: {
        fingerprint: "a1b2c3d4e5f60718", kind: "server", scope: "api:exams", name: "Error",
        firstSeenDay: "2026-10-28", firstVersion: "v1", lastSeenDay: "2026-11-01", lastVersion: "v2", total: 4,
        sampleMessage: "Failed to fetch exam paper for <email>", sampleFrame: "at handler (/src/app/api/exams/route.ts)",
        samplePath: "/exams/:id", samplePlatform: "docker", sampleDigest: "a1b2c3d4",
      } });
      await database.db.errorFingerprint.create({ data: {
        fingerprint: "b1b2c3d4e5f60718", kind: "client", scope: "[GlobalError]", name: "TypeError",
        firstSeenDay: "2026-11-01", firstVersion: "v2", lastSeenDay: "2026-11-01", lastVersion: "v2",
        total: 1, status: "fixed",
      } });
      await database.db.dailyError.createMany({ data: [
        { day: "2026-11-01", version: "v2", platform: "docker", fingerprint: "a1b2c3d4e5f60718", count: 3 },
        { day: "2026-11-01", version: "v2", platform: "android", fingerprint: "a1b2c3d4e5f60718", count: 1 },
        { day: "2026-11-01", version: "v2", platform: "docker", fingerprint: "b1b2c3d4e5f60718", count: 9 },
      ] });
      const open = await loadDashboard(database.db, "7", new Date("2026-11-01T12:00:00Z"), "open");
      expect(open.errors.map(error => error.fingerprint)).toEqual(["a1b2c3d4e5f60718"]);
      expect(open.errors[0]).toMatchObject({ sampleMessage: "Failed to fetch exam paper for <email>", samplePath: "/exams/:id" });
      expect(open.errors[0].platforms).toEqual([{ label: "docker", count: 3 }, { label: "android", count: 1 }]);
      const fixed = await loadDashboard(database.db, "7", new Date("2026-11-01T12:00:00Z"), "fixed");
      expect(fixed.errors.map(error => error.fingerprint)).toEqual(["b1b2c3d4e5f60718"]);
      const detail = await loadErrorDetail(database.db, "a1b2c3d4e5f60718", "7", new Date("2026-11-01T12:00:00Z"));
      expect(detail.error).toMatchObject({ count: 4, sampleFrame: "at handler (/src/app/api/exams/route.ts)" });
      expect(detail.error?.platforms).toEqual([{ label: "docker", count: 3 }, { label: "android", count: 1 }]);
      expect(detail.error?.trend).toEqual([{ day: "2026-11-01", count: 4 }]);
    } finally { await database.dispose(); }
  });
});

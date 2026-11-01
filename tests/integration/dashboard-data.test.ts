import { describe, expect, it } from "vitest";
import { temporaryDatabase } from "../helpers/database";
import { loadDashboard } from "@/lib/dashboard-data";

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
});

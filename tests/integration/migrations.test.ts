import { describe, expect, it } from "vitest";
import { temporaryDatabase } from "../helpers/database";
import { migrate } from "../../scripts/migrate";
import { getServiceSettings, invalidateSettings } from "@/lib/service-settings";

describe("正式迁移与设置缓存", () => {
  it("迁移可以重复执行且保留原有数据，拒绝被篡改的历史", async () => {
    const database = await temporaryDatabase();
    try {
      await database.db.dailyEvent.create({ data: { day: "2026-11-01", version: "v1", name: "app_opened", payloadKey: "{}", count: 3 } });
      expect(await migrate(database.client)).toBe(0);
      expect(await database.db.dailyEvent.count()).toBe(1);
      await database.client.execute('UPDATE "_telemetry_migrations" SET "checksum" = \'tampered\'');
      await expect(migrate(database.client)).rejects.toThrow("迁移历史缺失或校验和不一致");
      expect(await database.db.dailyEvent.findFirst()).toMatchObject({ count: 3 });
    } finally { await database.dispose(); }
  });
  it("设置最多缓存五分钟，非法配置不会静默恢复外发", async () => {
    const database = await temporaryDatabase();
    try {
      const at = Date.parse("2026-11-01T00:00:00Z");
      expect((await getServiceSettings(database.db, at)).minIntervalSec).toBe(21600);
      await database.db.serviceSetting.create({ data: { key: "minIntervalSec", value: "43200" } });
      expect((await getServiceSettings(database.db, at + 299_999)).minIntervalSec).toBe(21600);
      expect((await getServiceSettings(database.db, at + 300_000)).minIntervalSec).toBe(43200);
      await database.db.serviceSetting.update({ where: { key: "minIntervalSec" }, data: { value: "invalid-json" } });
      invalidateSettings(database.db);
      await expect(getServiceSettings(database.db, at + 301_000)).rejects.toThrow();
    } finally { await database.dispose(); }
  });
});

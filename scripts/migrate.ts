import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";
import { config } from "dotenv";

export async function migrate(client: Client, directory = new URL("../prisma/migrations/", import.meta.url)): Promise<number> {
  const names = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const migrations = await Promise.all(names.map(async name => {
    const sql = await readFile(new URL(`${name}/migration.sql`, directory), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
  const tx = await client.transaction("write");
  try {
    await tx.execute('CREATE TABLE IF NOT EXISTS "_telemetry_migrations" ("name" TEXT PRIMARY KEY, "checksum" TEXT NOT NULL)');
    const applied = await tx.execute('SELECT "name", "checksum" FROM "_telemetry_migrations" ORDER BY "name"');
    for (const row of applied.rows) {
      if (!migrations.some(migration => migration.name === row.name && migration.checksum === row.checksum)) {
        throw new Error("迁移历史缺失或校验和不一致");
      }
    }
    let count = 0;
    for (const migration of migrations) {
      if (applied.rows.some(row => row.name === migration.name)) continue;
      await tx.executeMultiple(migration.sql);
      await tx.execute({ sql: 'INSERT INTO "_telemetry_migrations" ("name", "checksum") VALUES (?, ?)', args: [migration.name, migration.checksum] });
      count += 1;
    }
    await tx.commit();
    return count;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally { tx.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  config({ path: [".env.local", ".env"], quiet: true });
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    process.stderr.write("迁移失败：缺少 TURSO_DATABASE_URL。\n");
    process.exitCode = 1;
  } else {
    const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    try { process.stdout.write(`迁移完成：新增 ${await migrate(client)} 项。\n`); }
    catch { process.stderr.write("迁移失败，请检查连接、权限和迁移历史；已有数据未被清空。\n"); process.exitCode = 1; }
    finally { client.close(); }
  }
}

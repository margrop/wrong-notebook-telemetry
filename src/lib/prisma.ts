import "server-only";
import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

export function createDatabase(url: string, authToken?: string) {
  const client = createClient({ url, authToken, intMode: "bigint" });
  const db = new PrismaClient({ adapter: new PrismaLibSQL(client), log: [] });
  return { db, client };
}

type Database = ReturnType<typeof createDatabase>;
const globalDatabase = globalThis as typeof globalThis & { telemetryDatabase?: Database };

export function getDatabase(): PrismaClient {
  if (!globalDatabase.telemetryDatabase) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("缺少 TURSO_DATABASE_URL");
    if (process.env.VERCEL && url.startsWith("file:")) {
      throw new Error("Vercel 环境必须连接远程数据库");
    }
    globalDatabase.telemetryDatabase = createDatabase(url, process.env.TURSO_AUTH_TOKEN);
  }
  return globalDatabase.telemetryDatabase.db;
}

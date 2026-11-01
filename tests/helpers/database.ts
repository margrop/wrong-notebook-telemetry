import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../../scripts/migrate";
import { createDatabase } from "@/lib/prisma";

export async function temporaryDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "wrong-notebook-telemetry-"));
  const url = `file:${join(directory, "test.db")}`;
  const { db, client } = createDatabase(url);
  await migrate(client);
  return { db, client, directory, url, async dispose() {
    await db.$disconnect();
    if (!client.closed) client.close();
    await rm(directory, { recursive: true, force: true });
  } };
}

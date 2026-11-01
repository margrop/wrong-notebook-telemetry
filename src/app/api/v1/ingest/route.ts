import { createIngestHandler } from "@/lib/ingest";
import { getDatabase } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;
export const POST = createIngestHandler({ getDb: getDatabase });

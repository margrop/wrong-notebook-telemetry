import { createMaintainHandler } from "@/lib/cron";
import { getDatabase } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = createMaintainHandler(getDatabase);

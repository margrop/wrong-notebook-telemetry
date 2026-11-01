import { apiError, jsonResponse } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { getDatabase } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(): Promise<Response> {
  try {
    // 检查正式表，避免把未迁移的空库误报为健康。
    await getDatabase().serviceSetting.count();
    return jsonResponse({ status: "ok", schema: 1 });
  } catch {
    logger.error("HEALTH_DATABASE_UNAVAILABLE");
    return apiError("NOT_READY", "服务尚未就绪", 503);
  }
}

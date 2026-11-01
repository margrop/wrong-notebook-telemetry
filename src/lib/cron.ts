import "server-only";
import type { PrismaClient } from "@prisma/client";
import { apiError, jsonResponse } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { maintain } from "@/lib/maintenance";
import { safeEqual } from "@/lib/secure-compare";

export function createMaintainHandler(getDb: () => PrismaClient, now = () => new Date()) {
  return async function GET(request: Request): Promise<Response> {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) return apiError("CRON_NOT_CONFIGURED", "维护凭据未配置", 503);
    if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return apiError("UNAUTHORIZED", "维护鉴权失败", 401);
    try { return jsonResponse({ ok: true, ...await maintain(getDb(), now()) }); }
    catch {
      logger.error("MAINTENANCE_FAILED");
      return apiError("MAINTENANCE_FAILED", "维护暂时失败", 503);
    }
  };
}

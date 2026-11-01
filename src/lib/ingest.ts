import "server-only";
import type { PrismaClient } from "@prisma/client";
import { aggregateBatch } from "@/lib/aggregate";
import { apiError, jsonResponse } from "@/lib/api-errors";
import { bodyErrorResponse, readJsonBody } from "@/lib/http";
import { envelopeSchema, MAX_BATCH_BYTES, TELEMETRY_SCHEMA_VERSION, validateItems } from "@/lib/ingest-contract";
import { logger } from "@/lib/logger";
import { ingestLimiter, requestRateKey } from "@/lib/rate-limit";
import type { RateLimiter } from "@/lib/rate-limit";
import { effectiveIngestControl, getServiceSettings } from "@/lib/service-settings";

interface Dependencies { getDb: () => PrismaClient; limiter?: RateLimiter; now?: () => Date }

export function createIngestHandler({ getDb, limiter = ingestLimiter, now = () => new Date() }: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    if (request.headers.has("origin")) return apiError("BROWSER_NOT_ALLOWED", "仅接受实例服务端上报", 403);
    const timestamp = now();
    const limit = limiter.hit(requestRateKey(request), timestamp.getTime());
    if (!limit.allowed) return apiError("RATE_LIMITED", "上报过于频繁", 429, { "Retry-After": String(limit.retryAfterSec) });
    try {
      const envelope = envelopeSchema.safeParse(await readJsonBody(request, MAX_BATCH_BYTES));
      if (!envelope.success) return apiError("INVALID_ENVELOPE", "上报批次结构不合法", 400);
      const { schema, version, items } = envelope.data;
      if (schema !== TELEMETRY_SCHEMA_VERSION) return apiError("SCHEMA_DISABLED", "协议版本已停用或不受支持", 410);
      const db = getDb();
      const settings = await getServiceSettings(db, timestamp.getTime());
      const control = effectiveIngestControl(settings, schema, version, timestamp);
      if (control.disabled) return apiError("VERSION_DISABLED", "此协议或应用版本已停用", 410);
      if (control.paused) return jsonResponse({ accepted: 0, rejected: items.length,
        retryAfterSec: control.retryAfterSec, minIntervalSec: settings.minIntervalSec });
      const validated = validateItems(items, timestamp);
      await aggregateBatch(db, version, validated.accepted, validated.rejected, timestamp);
      return jsonResponse({ accepted: validated.accepted.length, rejected: validated.rejected, minIntervalSec: settings.minIntervalSec });
    } catch (error) {
      const bodyError = bodyErrorResponse(error);
      if (bodyError) return bodyError;
      logger.error("INGEST_UNAVAILABLE");
      return apiError("SERVICE_UNAVAILABLE", "暂时无法接收，请稍后重试", 503, { "Retry-After": "60" });
    }
  };
}

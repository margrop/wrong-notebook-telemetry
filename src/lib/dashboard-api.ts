import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { apiError, jsonResponse } from "@/lib/api-errors";
import { createDashboardSession, getAuthConfig, requestIsAuthenticated, sessionCookie, verifyPassword } from "@/lib/dashboard-auth";
import { bodyErrorResponse, hasSameOrigin, readJsonBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { loginLimiter, requestRateKey } from "@/lib/rate-limit";
import { saveServiceSettings, settingsSchema } from "@/lib/service-settings";

export async function login(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) return apiError("ORIGIN_DENIED", "请求来源不合法", 403);
  const key = requestRateKey(request);
  const result = loginLimiter.hit(key);
  if (!result.allowed) return apiError("RATE_LIMITED", "尝试过多，请稍后再试", 429, { "Retry-After": String(result.retryAfterSec) });
  try {
    const config = getAuthConfig();
    if (!config) return apiError("AUTH_NOT_CONFIGURED", "尚未配置看板凭据", 503);
    const body = z.strictObject({ password: z.string().min(1).max(72) }).safeParse(await readJsonBody(request, 1024));
    if (!body.success) return apiError("INVALID_INPUT", "请输入有效密码", 400);
    if (!await verifyPassword(body.data.password, config)) return apiError("INVALID_CREDENTIALS", "密码不正确", 401);
    loginLimiter.reset(key);
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": sessionCookie(createDashboardSession(config)) });
  } catch (error) {
    const bodyError = bodyErrorResponse(error);
    if (bodyError) return bodyError;
    logger.error("DASHBOARD_LOGIN_UNAVAILABLE");
    return apiError("AUTH_UNAVAILABLE", "暂时无法登录", 503);
  }
}

export async function logout(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) return apiError("ORIGIN_DENIED", "请求来源不合法", 403);
  return jsonResponse({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

function protectWrite(request: Request): Response | undefined {
  if (!requestIsAuthenticated(request)) return apiError("UNAUTHORIZED", "请先登录", 401);
  if (!hasSameOrigin(request)) return apiError("ORIGIN_DENIED", "请求来源不合法", 403);
}

export function createSettingsHandler(getDb: () => PrismaClient) {
  return async function PATCH(request: Request): Promise<Response> {
    const denied = protectWrite(request);
    if (denied) return denied;
    try {
      const parsed = settingsSchema.safeParse(await readJsonBody(request, 12 * 1024));
      if (!parsed.success) return apiError("INVALID_SETTINGS", "服务设置不合法", 400);
      await saveServiceSettings(getDb(), parsed.data);
      return jsonResponse({ ok: true });
    } catch (error) {
      return bodyErrorResponse(error) ?? apiError("UPDATE_FAILED", "服务设置保存失败", 503);
    }
  };
}

export function createErrorHandler(getDb: () => PrismaClient) {
  return async function PATCH(request: Request, fingerprint: string): Promise<Response> {
    const denied = protectWrite(request);
    if (denied) return denied;
    if (!/^[0-9a-f]{16}$/.test(fingerprint)) return apiError("INVALID_FINGERPRINT", "指纹格式不合法", 400);
    try {
      const parsed = z.strictObject({ status: z.enum(["open", "ignored", "fixed"]), note: z.string().max(1000).nullable() })
        .safeParse(await readJsonBody(request, 8 * 1024));
      if (!parsed.success) return apiError("INVALID_INPUT", "状态或备注不合法", 400);
      const result = await getDb().errorFingerprint.updateMany({ where: { fingerprint }, data: parsed.data });
      if (!result.count) return apiError("NOT_FOUND", "错误指纹不存在", 404);
      return jsonResponse({ ok: true });
    } catch (error) {
      return bodyErrorResponse(error) ?? apiError("UPDATE_FAILED", "错误状态保存失败", 503);
    }
  };
}

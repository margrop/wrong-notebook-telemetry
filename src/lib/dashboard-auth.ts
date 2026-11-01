import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import { safeEqual } from "@/lib/secure-compare";

export const SESSION_MAX_AGE = 7 * 86_400;
export interface AuthConfig { passwordHash: string; secret: string }

export function getAuthConfig(): AuthConfig | undefined {
  const passwordHash = process.env.DASHBOARD_PASSWORD_HASH;
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!passwordHash || !/^\$2[aby]\$(?:1[0-6])\$[./A-Za-z0-9]{53}$/.test(passwordHash) || !secret || secret.length < 32) return undefined;
  return { passwordHash, secret };
}

function signature(value: string, config: AuthConfig): string {
  return createHmac("sha256", config.secret).update(`wrong-notebook-telemetry:${config.passwordHash}:${value}`).digest("base64url");
}

export function createDashboardSession(config: AuthConfig, now = Date.now()): string {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_MAX_AGE}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${signature(payload, config)}`;
}

export function verifyDashboardSession(token: string | undefined, config: AuthConfig | undefined, now = Date.now()): boolean {
  if (!token || !config || token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d{10,12}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[2])) return false;
  const expires = Number(parts[1]);
  const seconds = Math.floor(now / 1000);
  return expires > seconds && expires <= seconds + SESSION_MAX_AGE
    && safeEqual(parts[3], signature(parts.slice(0, 3).join("."), config));
}

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-wn-telemetry" : "wn-telemetry-dev";
}

export function sessionCookie(token: string, maxAge = SESSION_MAX_AGE): string {
  return `${sessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function requestIsAuthenticated(request: Request): boolean {
  const key = `${sessionCookieName()}=`;
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(key));
  return verifyDashboardSession(cookie?.slice(key.length), getAuthConfig());
}

export async function verifyPassword(password: string, config: AuthConfig): Promise<boolean> {
  return Buffer.byteLength(password) <= 72 && compare(password, config.passwordHash);
}

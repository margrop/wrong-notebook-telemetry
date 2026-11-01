import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

interface Entry { count: number; expires: number }

export class RateLimiter {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly maxKeys = 10_000) {}

  hit(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    let entry = this.entries.get(key);
    if (entry && entry.expires <= now) { this.entries.delete(key); entry = undefined; }
    if (!entry) {
      if (this.entries.size >= this.maxKeys) {
        for (const [storedKey, stored] of this.entries) {
          if (stored.expires <= now) this.entries.delete(storedKey);
        }
      }
      // 达到内存上限时拒绝新键，避免用新来源淘汰旧计数来绕过限流。
      if (this.entries.size >= this.maxKeys) return { allowed: false, retryAfterSec: Math.ceil(this.windowMs / 1000) };
      entry = { count: 0, expires: now + this.windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= this.limit, retryAfterSec: Math.max(1, Math.ceil((entry.expires - now) / 1000)) };
  }

  reset(key: string): void { this.entries.delete(key); }
}

const processSalt = randomBytes(32);

export function requestRateKey(request: Request): string {
  let address: string | undefined;
  if (process.env.VERCEL === "1") {
    address = request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim();
  } else if (process.env.TRUST_PROXY_HEADERS === "true") {
    address = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  }
  const value = address && isIP(address) ? address : "unknown";
  return createHmac("sha256", processSalt).update(value).digest("hex");
}

export const ingestLimiter = new RateLimiter(10, 60_000);
export const loginLimiter = new RateLimiter(5, 15 * 60_000);

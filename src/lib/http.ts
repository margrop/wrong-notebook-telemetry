import { apiError } from "@/lib/api-errors";

export class RequestBodyError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new RequestBodyError(415, "UNSUPPORTED_MEDIA_TYPE", "请使用 application/json");
  }
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding !== "identity") {
    throw new RequestBodyError(415, "UNSUPPORTED_ENCODING", "不接受压缩请求体");
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    throw new RequestBodyError(413, "BODY_TOO_LARGE", "请求体超过限制");
  }
  if (!request.body) throw new RequestBodyError(400, "INVALID_JSON", "请求体不能为空");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RequestBodyError(413, "BODY_TOO_LARGE", "请求体超过限制");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)) as unknown;
  } catch {
    throw new RequestBodyError(400, "INVALID_JSON", "JSON 格式不正确");
  }
}

export function bodyErrorResponse(error: unknown): Response | undefined {
  return error instanceof RequestBodyError ? apiError(error.code, error.message, error.status) : undefined;
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const target = new URL(request.url);
    // Next.js 可将监听地址规范化为 localhost；浏览器实际来源由 Host 确定。
    const host = request.headers.get("host");
    if (host) target.host = host;
    return new URL(origin).origin === target.origin;
  }
  catch { return false; }
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json(body, { status, headers: responseHeaders });
}

export function apiError(code: string, message: string, status: number, headers?: HeadersInit): Response {
  return jsonResponse({ error: { code, message } }, status, headers);
}

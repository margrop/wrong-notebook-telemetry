import { createErrorHandler } from "@/lib/dashboard-api";
import { getDatabase } from "@/lib/prisma";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ fingerprint: string }> }): Promise<Response> {
  return createErrorHandler(getDatabase)(request, (await context.params).fingerprint);
}

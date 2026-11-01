import { createSettingsHandler } from "@/lib/dashboard-api";
import { getDatabase } from "@/lib/prisma";
export const runtime = "nodejs";
export const PATCH = createSettingsHandler(getDatabase);

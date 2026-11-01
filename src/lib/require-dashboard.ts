import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthConfig, sessionCookieName, verifyDashboardSession } from "@/lib/dashboard-auth";

// App Router 可能并行执行页面与布局，私有查询前必须在页面内再次鉴权。
export async function requireDashboard(): Promise<void> {
  if (!verifyDashboardSession((await cookies()).get(sessionCookieName())?.value, getAuthConfig())) redirect("/login");
}

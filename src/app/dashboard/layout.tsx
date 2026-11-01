import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { getAuthConfig, sessionCookieName, verifyDashboardSession } from "@/lib/dashboard-auth";
import { t } from "@/lib/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!verifyDashboardSession((await cookies()).get(sessionCookieName())?.value, getAuthConfig())) redirect("/login");
  return <main><header><Link href="/dashboard">{t.appName}</Link><nav><Link href="/dashboard">{t.nav.stats}</Link><Link href="/dashboard/settings">{t.nav.settings}</Link><Link href="/privacy">{t.nav.privacyShort}</Link><LogoutButton /></nav></header>{children}</main>;
}

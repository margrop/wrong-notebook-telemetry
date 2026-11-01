"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/translations";

export function LogoutButton() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  async function logout() {
    try {
      const response = await fetch("/api/dashboard/logout", { method: "POST" });
      if (!response.ok) { setFailed(true); return; }
      router.replace("/login"); router.refresh();
    } catch { setFailed(true); }
  }
  return <div><button className="secondary" onClick={logout}>{t.controls.logout}</button>{failed && <span role="alert">{t.controls.operationFailed}</span>}</div>;
}

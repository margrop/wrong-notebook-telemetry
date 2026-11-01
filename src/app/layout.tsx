import type { Metadata } from "next";
import type { ReactNode } from "react";
import { t } from "@/lib/translations";
import "./globals.css";

export const metadata: Metadata = {
  title: t.appName,
  description: "错题本匿名使用统计收集服务，源码公开，数据私有。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

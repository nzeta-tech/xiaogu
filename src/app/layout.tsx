import type { Metadata } from "next";
import "./globals.css";
import { bootstrapBackgroundWorkRecovery } from "@/lib/creation/background-run-bootstrap";

export const metadata: Metadata = {
  title: "小谷",
  description: "面向保险经纪人的专业、有温度的热点选题与短视频文案智能体",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  bootstrapBackgroundWorkRecovery();

  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

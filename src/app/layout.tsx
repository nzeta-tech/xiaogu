import type { Metadata } from "next";
import "./globals.css";
import "./product.css";
import { bootstrapBackgroundWorkRecovery } from "@/lib/creation/background-run-bootstrap";

export const metadata: Metadata = {
  title: "小谷",
  description: "面向财富、保险与财经从业者的专业内容与经营助手",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  bootstrapBackgroundWorkRecovery();

  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

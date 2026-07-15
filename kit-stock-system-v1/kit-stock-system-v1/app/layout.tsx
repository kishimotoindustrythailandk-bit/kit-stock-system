import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KIT Stock Verification",
  description: "ระบบตรวจสอบบ๊อคงานด้วยบาร์โค้ดและรูปถ่ายยืนยัน",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

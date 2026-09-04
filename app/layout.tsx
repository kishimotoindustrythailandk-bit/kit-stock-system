import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KIT Delivery Due Control",
  description: "ระบบนำเข้าแผนส่งงานและตัดยอด Due ด้วย QR Tag",
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xây Ngôi Nhà Đảng Vững Mạnh",
  description: "Trải nghiệm tương tác xây dựng công trình theo đội.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "sonner";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "FootChron | スポーツチーム専用の試合記録・選手名鑑プラットフォーム",
  description:
    "試合結果の自動グラフ化や詳細な選手名鑑を、誰でも簡単に作成・公開。チームの歴史をデータで資産化するF-MAIN。",
  keywords: ["スポーツ記録", "選手名鑑", "試合速報", "チーム運営"],
  verification: {
    google: "S1ug_Ca7PwWYF9UVwZQ6hqBwFdW6MCNS9c1eLb5j_0Q",
  },
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning translate="no" className="notranslate">
      <body className="antialiased notranslate" translate="no">
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}

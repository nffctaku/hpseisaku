import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "FootChron | サッカー・フットサルHP作成・スタッツ管理【初期0円】",
  description:
    "サッカー、フットサル、ソサイチ特化型のホームページ作成アプリ。一般的なノーコードにはない選手名鑑・スタッツ集計・大会管理を標準装備。初期費用0円、月額1,980円でプロ級のチームサイトを即公開。",
  keywords: [
    "サッカー チーム ホームページ作成",
    "フットサル サイト作成",
    "スタッツ管理",
    "選手名鑑 作成",
    "ソサイチ ホームページ",
    "少年サッカー 団員募集",
    "試合結果 集計 アプリ",
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "FootChron | サッカー・フットサルHP作成・スタッツ管理【初期0円】",
    description:
      "サッカー、フットサル、ソサイチ特化型のホームページ作成アプリ。選手名鑑やスタッツ集計など、現場の欲しい機能を1,980円で。専門知識不要でプロ級のデザインが手に入ります。",
    url: siteUrl,
    siteName: "FootChron",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FootChron | サッカー・フットサルHP作成・スタッツ管理【初期0円】",
    description:
      "一般的なノーコードにはない「サッカー専用機能」が満載。選手名鑑も試合データもこれ一つ。初期0円・月額1,980円でチームをブランディング。",
  },
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
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            {children}
            <Toaster richColors position="top-right" />
            <Analytics />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

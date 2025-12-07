"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function LandingPage() {
  const router = useRouter();
  const { user } = useAuth();

  const handleViewClub = () => {
    const clubId = user?.clubId;
    if (clubId) {
      router.push(`/${clubId}`);
    } else {
      // まだクラブプロフィールがないユーザーは、管理画面（チーム/クラブ設定）からスタート
      router.push("/admin/competitions");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="w-full bg-gray-900 text-white flex items-center justify-between px-4 py-3">
        <div className="text-xl font-bold tracking-tight">CLUB APP</div>
        <Link
          href="/admin/competitions"
          className="text-sm px-3 py-1 rounded-md border border-white/30 hover:bg-white hover:text-gray-900 transition-colors"
        >
          管理画面へ
        </Link>
      </header>

      <main className="flex-grow flex items-center justify-center px-4">
        <div className="max-w-xl w-full text-center space-y-6 sm:space-y-8 py-10 sm:py-12">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-2 sm:mb-3 leading-snug">
              チーム運営に必要なページを、全部かんたん作成。
            </h1>
            <p className="text-xs sm:text-base text-muted-foreground leading-relaxed">
              クラブHP／大会管理／試合記録／選手一覧を一括管理。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleViewClub}
              className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-colors"
            >
              クラブHPを見る
            </button>
            <Link
              href="/admin/competitions"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-input bg-background hover:bg-muted font-semibold text-sm"
            >
              ログインして管理する
            </Link>
          </div>

          <p className="text-xs text-muted-foreground">
            ※ ログインしている場合は自分のクラブページへ、未設定の場合はチーム管理画面へ移動します。
          </p>
        </div>
      </main>

      <footer className="p-4 md:p-6 text-center text-muted-foreground text-sm">
        <div className="flex justify-center items-center space-x-6 mb-4">
          <Link
            href="https://www.footballtop.net/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            利用規約
          </Link>
          <Link
            href="https://www.locofootball.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            プライバシーポリシー
          </Link>
          <Link href="/tokusho" className="hover:text-primary transition-colors">
            特定商取引法に基づく表記
          </Link>
        </div>
        <p>&copy; {new Date().getFullYear()} Your Club Site. All rights reserved.</p>
      </footer>
    </div>
  );
}

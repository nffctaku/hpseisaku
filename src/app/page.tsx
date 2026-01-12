"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import * as React from "react";

export default function LandingPage() {
  const router = useRouter();
  const { user } = useAuth();

  const slideRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const sliderContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [slideIndex, setSlideIndex] = React.useState(0);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % 4);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    const el = slideRefs.current[slideIndex];
    const container = sliderContainerRef.current;
    if (!el || !container) return;

    const left = el.offsetLeft - (container.clientWidth - el.clientWidth) / 2;
    container.scrollTo({ left, behavior: "smooth" });
  }, [slideIndex]);

  const handleViewClub = () => {
    const clubId = user?.clubId;
    if (clubId) {
      router.push(`/${clubId}`);
    } else {
      // まだクラブプロフィールがないユーザーは、管理画面（チーム/クラブ設定）からスタート
      router.push("/admin/competitions");
    }
  };

  const handleProtectedViewClub = (e: React.MouseEvent) => {
    e.preventDefault();

    const okKey = "footchron_pre_release_ok";
    if (window.sessionStorage.getItem(okKey) === "1") {
      handleViewClub();
      return;
    }

    const entered = window.prompt("パスワードを入力してください");
    if (entered !== "2026") return;

    window.sessionStorage.setItem(okKey, "1");
    handleViewClub();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="w-full bg-white text-gray-900 flex items-center justify-between px-2 sm:px-4 py-2 border-b">
        <div className="relative w-[40px] sm:w-[250px] h-[40px] sm:h-[48px] flex-shrink-0">
          <Image
            src="/サイトロゴのみ.png"
            alt="FootChorn"
            fill
            className="object-contain object-center sm:object-left"
            sizes="(min-width: 640px) 220px, 40px"
            priority
          />
        </div>
        <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto flex-nowrap max-w-full">
          <Link
            href="/admin/competitions"
            onClick={handleProtectedViewClub}
            className="inline-flex items-center text-sm px-3 sm:px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            始める
          </Link>
        </div>
      </header>

      <main className="flex-grow">
        <section className="relative overflow-hidden">
          <div className="container mx-auto px-4 pt-28 pb-2 sm:pt-40 sm:pb-6">
            <div className="max-w-5xl mx-auto">
              <div className="text-center space-y-2 sm:space-y-3">
                <div className="flex justify-center">
                  <div className="relative w-[360px] sm:w-[520px] h-[68px] sm:h-[96px]">
                    <Image
                      src="/サイトロゴ文字.png"
                      alt="FootChorn"
                      fill
                      className="object-contain"
                      sizes="(min-width: 640px) 520px, 360px"
                      priority
                    />
                  </div>
                </div>
                <h1 className="mt-16 sm:mt-24 text-2xl sm:text-4xl font-bold tracking-tight leading-tight mb-1 sm:mb-2">クラブの歴史を、ここに刻め。</h1>
              </div>

              <div className="mt-10 sm:mt-16 flex justify-center">
                <div className="grid grid-cols-1 gap-3 items-end w-[92vw] max-w-[420px]">
                  <div className="relative w-full aspect-[1/1] bg-transparent">
                    <Image
                      src="/LP用１０.png"
                      alt="FootChorn screen 1"
                      fill
                      className="object-contain"
                      sizes="(min-width: 640px) 420px, 92vw"
                      priority
                    />
                  </div>
                </div>
              </div>

              <div className="mt-2 sm:mt-3 text-center">
                <div className="mx-auto max-w-2xl text-sm sm:text-base leading-relaxed text-muted-foreground">
                  <p className="font-semibold text-foreground">
                    <span className="block">リアルも、ゲームも。</span>
                    <span className="block">これ一つで、プロ級のクラブ管理。</span>
                  </p>
                  <p className="mt-1 text-[11px] sm:text-xs">
                    <span className="block sm:inline">リアルなサッカークラブの運営から、</span>{" "}
                    <span className="block sm:inline">eスポーツ（Footballゲーム）のクラン管理まで。</span>{" "}
                    <span className="block sm:inline">クラブに関わるすべての情報を、一つの公式記録として集約します。</span>
                  </p>
                  <p className="mt-2">
                    <br />
                    <span className="block sm:inline">自分のチームを「プロのクラブ」として可視化したい、</span>{" "}
                    <span className="block sm:inline">すべてのプレイヤー・監督のために。</span>
                    <br />
                  </p>
                </div>
              </div>

              <div className="mt-2 sm:mt-3">
                <div ref={sliderContainerRef} className="mx-auto max-w-5xl overflow-x-auto">
                  <div className="flex gap-3 px-4 snap-x snap-mandatory">
                    <div
                      ref={(el) => {
                        slideRefs.current[0] = el;
                      }}
                      className="snap-center shrink-0 w-[88vw] max-w-[420px]"
                    >
                      <div className="relative w-full aspect-[1/1]">
                        <Image
                          src="/LP用３.png"
                          alt="FootChorn screen 2"
                          fill
                          className="object-contain"
                          sizes="(min-width: 640px) 420px, 88vw"
                        />
                      </div>
                    </div>

                    <div
                      ref={(el) => {
                        slideRefs.current[1] = el;
                      }}
                      className="snap-center shrink-0 w-[88vw] max-w-[420px]"
                    >
                      <div className="relative w-full aspect-[1/1]">
                        <Image
                          src="/LP用８.png"
                          alt="FootChorn screen 3"
                          fill
                          className="object-contain"
                          sizes="(min-width: 640px) 420px, 88vw"
                        />
                      </div>
                    </div>

                    <div
                      ref={(el) => {
                        slideRefs.current[2] = el;
                      }}
                      className="snap-center shrink-0 w-[88vw] max-w-[420px]"
                    >
                      <div className="relative w-full aspect-[1/1]">
                        <Image
                          src="/LP用９.png"
                          alt="FootChorn screen 4"
                          fill
                          className="object-contain"
                          sizes="(min-width: 640px) 420px, 88vw"
                        />
                      </div>
                    </div>

                    <div
                      ref={(el) => {
                        slideRefs.current[3] = el;
                      }}
                      className="snap-center shrink-0 w-[88vw] max-w-[420px]"
                    >
                      <div className="relative w-full aspect-[1/1]">
                        <Image
                          src="/LP用７.png"
                          alt="FootChorn screen 5"
                          fill
                          className="object-contain"
                          sizes="(min-width: 640px) 420px, 88vw"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div id="features" className="mt-2 sm:mt-3 text-center">
                <ul className="mx-auto max-w-2xl text-sm sm:text-base leading-relaxed text-muted-foreground space-y-1">
                  <li>試合結果・順位表を自動でグラフ化</li>
                  <li>詳細な選手名鑑と能力レーダーチャート</li>
                  <li>クラブ専用の公式サイトを即時公開</li>
                  <li>日々の記録が、そのままクラブの歴史に</li>
                </ul>
              </div>

              <div className="mt-3 sm:mt-4 text-center space-y-3">
                <p className="text-lg sm:text-2xl font-bold">
                  試合・選手・順位を
                  <br className="sm:hidden" />
                  簡単に記録・公開が可能。
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/admin/competitions"
                    onClick={handleProtectedViewClub}
                    className="inline-flex items-center justify-center px-8 py-3 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-sm transition-colors"
                  >
                    ログイン
                  </Link>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  ※ ログインしている場合は自分のクラブページへ、未設定の場合はチーム管理画面へ移動します。
                </p>

                <div className="mt-3 flex justify-center">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-5xl">
                    <div className="relative w-[92vw] max-w-[560px] sm:w-full sm:max-w-none aspect-[1/1]">
                      <Image
                        src="/プラン内容Free.png"
                        alt="プラン内容 Free"
                        fill
                        className="object-contain"
                        sizes="(min-width: 640px) 560px, 92vw"
                      />
                    </div>
                    <div className="relative w-[92vw] max-w-[560px] sm:w-full sm:max-w-none aspect-[1/1]">
                      <Image
                        src="/プラン内容.png"
                        alt="プラン内容"
                        fill
                        className="object-contain"
                        sizes="(min-width: 640px) 560px, 92vw"
                      />
                    </div>
                    <div className="relative w-[92vw] max-w-[560px] sm:w-full sm:max-w-none aspect-[1/1]">
                      <Image
                        src="/プラン内容全開放.png"
                        alt="プラン内容 全開放"
                        fill
                        className="object-contain"
                        sizes="(min-width: 640px) 560px, 92vw"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="p-4 md:p-6 text-center text-muted-foreground text-sm">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mb-2">
          <Link href="/terms" className="hover:text-foreground transition-colors whitespace-nowrap">
            利用規約
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors whitespace-nowrap">
            プライバシーポリシー
          </Link>
          <Link href="/tokusho" className="hover:text-foreground transition-colors whitespace-nowrap">
            特定商取引法に基づく表記
          </Link>
        </div>
        <p>&copy; {new Date().getFullYear()} Your Club Site. All rights reserved.</p>
      </footer>
    </div>
  );
}

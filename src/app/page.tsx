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
      <main className="flex-grow">
        <section className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-2 sm:px-4 py-2">
            <div className="relative w-[64px] sm:w-[320px] h-[64px] sm:h-[64px] flex-shrink-0">
              <Image
                src="/ロゴ新.png"
                alt="FootChorn"
                fill
                className="object-contain object-center sm:object-left"
                sizes="(min-width: 640px) 320px, 64px"
                priority
              />
            </div>
            <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto flex-nowrap max-w-full">
              <Link
                href="/admin/competitions"
                onClick={handleProtectedViewClub}
                className="hidden sm:inline-flex items-center text-sm px-3 sm:px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                始める
              </Link>
            </div>
          </div>

          <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-white overflow-hidden sm:hidden">
            <Image
              src="/トップページモバイル３.jpg"
              alt="FootChorn"
              width={576}
              height={1024}
              className="w-full h-auto"
              sizes="100vw"
              priority
            />

            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
              <Link
                href="/admin/competitions"
                onClick={handleProtectedViewClub}
                className="inline-flex items-center text-sm px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                始める
              </Link>
            </div>
          </div>

          <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] hidden h-[65vw] min-h-[420px] max-h-[880px] bg-white overflow-hidden sm:block">
            <Image
              src="/トップページPC２.png"
              alt="FootChorn"
              fill
              className="object-contain object-center"
              sizes="100vw"
              priority
            />
          </div>

          <div className="sm:hidden pt-0">
            <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-white overflow-hidden">
              <Image
                src="/モバイル情報B.jpg"
                alt="FootChorn"
                width={1170}
                height={2532}
                className="w-full h-auto"
                sizes="100vw"
              />
            </div>
          </div>

          <div className="sm:hidden pt-0">
            <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-white overflow-hidden">
              <Image
                src="/モバイル情報A.jpg"
                alt="FootChorn"
                width={1170}
                height={2532}
                className="w-full h-auto"
                sizes="100vw"
              />
            </div>
          </div>

          <div className="hidden sm:block pt-0">
            <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-white overflow-hidden">
              <Image
                src="/トップページPC情報２.png"
                alt="FootChorn"
                width={1920}
                height={1080}
                className="w-full h-auto"
                sizes="100vw"
              />
            </div>
          </div>

          <div className="container mx-auto px-4 pt-6 pb-2 sm:pt-8 sm:pb-6">
            <div className="max-w-5xl mx-auto">
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

                <div className="flex flex-col items-center sm:flex-row sm:items-stretch gap-3 justify-center">
                  <Link
                    href="/admin/competitions"
                    onClick={handleProtectedViewClub}
                    className="inline-flex items-center justify-center w-1/2 max-w-[220px] px-8 py-3 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-sm transition-colors"
                  >
                    ログイン
                  </Link>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  ※ ログインしている場合は自分のクラブページへ、未設定の場合はチーム管理画面へ移動します。
                </p>

                <div className="mt-6 flex justify-center">
                  <div className="w-full max-w-[420px] bg-[#21c45a] rounded-xl px-6 py-6 text-white text-center">
                    <div className="text-lg font-bold">LINE登録で、最新情報をいちはやくゲット！</div>
                    <div className="mt-2 text-sm text-white/90">便利な機能とお得な情報をLINEでお届け</div>

                    <a
                      href="https://lin.ee/0IxYvaa"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center justify-center gap-2 bg-white text-[#21c45a] font-semibold rounded-full h-12 px-8"
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#21c45a] text-white text-[10px] font-bold">
                        LINE
                      </span>
                      <span>LINE登録する</span>
                    </a>
                  </div>
                </div>

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

      <footer className="bg-zinc-900 text-zinc-100">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="text-left">
            <div className="text-sm font-semibold mb-4">法的事項</div>
            <div className="flex flex-col gap-3 text-sm text-zinc-200">
              <Link href="/privacy" className="hover:text-white transition-colors">
                プライバシーポリシー
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                利用規約（ユーザー）
              </Link>
              <Link href="/tokusho" className="hover:text-white transition-colors">
                特定商取引法に基づく表記
              </Link>
            </div>
          </div>

          <div className="mt-10 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-400">
            &copy; 2024-{new Date().getFullYear()} 株式会社Loco All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

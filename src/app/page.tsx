"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import * as React from "react";
import { SystemAnnouncement } from "@/components/system-announcement";
import { SnapPager } from "@/components/SnapPager";

export default function LandingPage() {
  const { user } = useAuth();

  const slideRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const sliderContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [slideIndex, setSlideIndex] = React.useState(0);
  const [currentInfoSlide, setCurrentInfoSlide] = React.useState(0);
  const mobileInfoSlideCount = 2;

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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SystemAnnouncement />
      <main className="flex-grow">
        <section className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-end px-2 sm:px-4 py-2">
            <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto flex-nowrap max-w-full">
              <Link
                href="/admin"
                className="hidden sm:inline-flex items-center text-base sm:text-lg px-6 sm:px-8 py-4 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                始める
              </Link>
            </div>
          </div>

          <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-white overflow-hidden sm:hidden">
            <div className="relative w-full h-[75vh]">
              <Image
                src="/top-hero-mobile.jpg"
                alt="FootChorn"
                fill
                className="object-cover object-top"
                sizes="100vw"
                priority
              />
            </div>

            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
              <Link
                href="/admin"
                className="inline-flex items-center text-base px-12 py-4 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                無料で始める
              </Link>
            </div>
          </div>

          <div className="sm:hidden relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-white overflow-hidden">
            <Image
              src="/リアルも、 ゲームも。 Webアプリで、 プロ級のクラブ管理。 (1).jpg"
              alt="リアルも、ゲームも。Webアプリで、プロ級のクラブ管理。"
              width={1080}
              height={1920}
              className="w-full h-auto"
              sizes="100vw"
              priority
            />
          </div>

          <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] hidden h-[65vw] min-h-[420px] max-h-[880px] bg-white overflow-hidden sm:block">
            <Image
              src="/PCトップ画像.png"
              alt="FootChorn"
              fill
              className="object-contain object-center"
              sizes="100vw"
              priority
            />
          </div>

          <div className="sm:hidden pt-0 relative">
            <div className="absolute top-1/2 left-2 z-10 transform -translate-y-1/2">
              <button
                onClick={() => setCurrentInfoSlide((prev) => (prev - 1 + mobileInfoSlideCount) % mobileInfoSlideCount)}
                className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
              >
                &lt;
              </button>
            </div>
            <div className="absolute top-1/2 right-2 z-10 transform -translate-y-1/2">
              <button
                onClick={() => setCurrentInfoSlide((prev) => (prev + 1) % mobileInfoSlideCount)}
                className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
              >
                &gt;
              </button>
            </div>
            <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-white overflow-hidden">
              <div className="relative w-full h-[80vh] overflow-hidden">
                <div 
                  className="flex transition-transform duration-700 ease-in-out"
                  style={{ transform: `translateX(-${currentInfoSlide * 100}%)` }}
                >
                  <div className="w-full flex-shrink-0 h-[80vh] relative">
                    <Image
                      src="/モバイル情報最新１.jpg"
                      alt="FootChorn"
                      fill
                      className="object-cover"
                      sizes="100vw"
                      priority
                    />
                  </div>
                  <div className="w-full flex-shrink-0 h-[80vh] relative">
                    <Image
                      src="/モバイル情報最新２.jpg"
                      alt="FootChorn"
                      fill
                      className="object-cover"
                      sizes="100vw"
                      priority
                    />
                  </div>
                </div>
              </div>
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

          <div className="container mx-auto px-4 pt-6 pb-0 sm:pt-8 sm:pb-6">
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

              <div className="mt-3 sm:mt-4 text-center">
                <p className="text-lg sm:text-2xl font-bold">
                  試合・選手・順位を
                  <br className="sm:hidden" />
                  簡単に記録・公開が可能。
                </p>
              </div>

              <div className="mt-6">
                <div className="sm:hidden relative w-screen left-1/2 -ml-[50vw] bg-[#21c45a] text-white">
                  <div className="mx-auto max-w-5xl px-6 py-6 text-center">
                    <div className="text-lg font-bold">LINE登録で、最新情報をすぐゲット！</div>
                    <div className="mt-2 text-sm text-white/90">アップデート情報をLINEでお届け</div>

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

                <div className="hidden sm:block relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-[#21c45a] text-white">
                  <div className="mx-auto max-w-5xl px-6 py-6 text-center">
                    <div className="text-lg font-bold">LINE登録で、最新情報をすぐゲット！</div>
                    <div className="mt-2 text-sm text-white/90">アップデート情報をLINEでお届け</div>

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
              </div>

              {/* Plan Cards */}
              <div className="mt-8">
                <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
                  {/* Free Card */}
                  <div className="relative rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-[14px] font-semibold text-gray-900">Free プラン</h2>
                      <p className="text-[20px] font-semibold text-gray-900">月額 0円</p>
                    </div>
                    <p className="text-[11px] text-gray-600 mb-6">まずは無料で始められます</p>

                    <ul className="space-y-3 mb-6">
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700">選手登録 30名まで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700">選手画像登録 30枚まで</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700">チーム画像登録 20枚まで</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700">チーム登録数 無制限</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700">大会作成 3つまで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700">選手名鑑生成 A4ver</span>
                      </li>
                    </ul>

                    <Link
                      href="/admin"
                      className="block w-full text-center py-3 rounded-md bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
                    >
                      無料で始める
                    </Link>
                  </div>

                  {/* Pro Card */}
                  <div className="relative rounded-xl border border-blue-500 bg-white p-6 shadow-lg">
                    <div className="absolute -top-3 left-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500 text-white">
                        おすすめ
                      </span>
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-[14px] font-semibold text-gray-900">Pro プラン</h2>
                      <p className="text-[20px] font-semibold text-blue-600">月額 380円</p>
                    </div>
                    <p className="text-[11px] text-gray-600 mb-6">チーム運営を本格的にサポート</p>

                    <ul className="space-y-3 mb-6">
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-900">選手登録 50名まで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-900">選手画像登録 50枚まで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-900">チーム登録数 無制限</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-900">チーム画像登録 無制限</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-900">大会作成 無制限</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-900">選手名鑑生成 フル機能</span>
                      </li>
                    </ul>

                    <Link
                      href="/admin"
                      className="block w-full text-center py-3 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Proで始める
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-zinc-900 text-zinc-100 mt-16">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="text-left">
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

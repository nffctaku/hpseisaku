"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import * as React from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";

export default function LandingPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [featureCarouselApi, setFeatureCarouselApi] = React.useState<CarouselApi>();

  React.useEffect(() => {
    if (!featureCarouselApi) return;
    const id = window.setInterval(() => {
      featureCarouselApi.scrollNext();
    }, 3000);
    return () => {
      window.clearInterval(id);
    };
  }, [featureCarouselApi]);

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
      <header className="w-full bg-white text-gray-900 flex items-center justify-between px-4 py-3 border-b">
        <div className="text-2xl font-extrabold tracking-tight text-yellow-400 drop-shadow">
          FHUB
        </div>
        <Link
          href="/admin/competitions"
          className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          FHUBを開く
        </Link>
      </header>

      <main className="flex-grow">
        <section className="relative overflow-hidden">
          <div className="container mx-auto px-4 py-10 sm:py-14">
            <div className="max-w-5xl mx-auto">
              <div className="text-center space-y-4 sm:space-y-5">
                <div className="text-4xl sm:text-6xl font-extrabold tracking-tight text-yellow-400 drop-shadow">
                  FHUB
                </div>
                <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
                  スマホひとつで、
                  <br />
                  プロ仕様のクラブサイト。
                </h1>
              </div>

              <div className="mt-8 sm:mt-10 flex justify-center">
                <div className="grid grid-cols-2 gap-4 sm:gap-8 items-end">
                  <div className="relative w-[44vw] max-w-[260px] sm:w-[240px] sm:max-w-none aspect-[9/16]">
                    <Image
                      src="/FHUBスマホ①.png"
                      alt="FHUB 1"
                      fill
                      className="object-contain"
                      sizes="(min-width: 640px) 240px, 44vw"
                      priority
                    />
                  </div>
                  <div className="relative w-[44vw] max-w-[260px] sm:w-[240px] sm:max-w-none aspect-[9/16]">
                    <Image
                      src="/FHUBスマホ②.png"
                      alt="FHUB 2"
                      fill
                      className="object-contain"
                      sizes="(min-width: 640px) 240px, 44vw"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 sm:mt-10 text-center space-y-4">
                <p className="text-lg sm:text-2xl font-bold">
                  Footballに特化し
                  <br />
                  HPを作成出来るWEBアプリ
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/admin/competitions"
                    className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-sm transition-colors"
                  >
                    ログインして管理する
                  </Link>
                </div>

                <p className="text-xs text-muted-foreground">
                  ※ ログインしている場合は自分のクラブページへ、未設定の場合はチーム管理画面へ移動します。
                </p>
              </div>

              <div className="mt-12 sm:mt-16">
                <div className="sm:hidden">
                  <Carousel
                    setApi={setFeatureCarouselApi}
                    opts={{ loop: true }}
                    className="w-full max-w-[260px] mx-auto"
                  >
                    <CarouselContent>
                      <CarouselItem>
                        <div className="relative w-full aspect-[4/5] bg-transparent">
                          <Image
                            src="/FHUB.png"
                            alt="FHUB feature 1"
                            fill
                            className="object-contain"
                            sizes="100vw"
                          />
                        </div>
                      </CarouselItem>
                      <CarouselItem>
                        <div className="relative w-full aspect-[4/5] bg-transparent">
                          <Image
                            src="/FHUB (1).png"
                            alt="FHUB feature 2"
                            fill
                            className="object-contain"
                            sizes="100vw"
                          />
                        </div>
                      </CarouselItem>
                      <CarouselItem>
                        <div className="relative w-full aspect-[4/5] bg-transparent">
                          <Image
                            src="/FHUB (2).png"
                            alt="FHUB feature 3"
                            fill
                            className="object-contain"
                            sizes="100vw"
                          />
                        </div>
                      </CarouselItem>
                    </CarouselContent>
                  </Carousel>
                </div>

                <div className="hidden sm:grid grid-cols-3 gap-6 sm:gap-8 items-center">
                  <div className="relative w-full max-w-[280px] mx-auto aspect-[4/5] bg-transparent">
                    <Image
                      src="/FHUB.png"
                      alt="FHUB feature 1"
                      fill
                      className="object-contain"
                      sizes="(min-width: 640px) 33vw, 100vw"
                    />
                  </div>
                  <div className="relative w-full max-w-[280px] mx-auto aspect-[4/5] bg-transparent">
                    <Image
                      src="/FHUB (1).png"
                      alt="FHUB feature 2"
                      fill
                      className="object-contain"
                      sizes="(min-width: 640px) 33vw, 100vw"
                    />
                  </div>
                  <div className="relative w-full max-w-[280px] mx-auto aspect-[4/5] bg-transparent">
                    <Image
                      src="/FHUB (2).png"
                      alt="FHUB feature 3"
                      fill
                      className="object-contain"
                      sizes="(min-width: 640px) 33vw, 100vw"
                    />
                  </div>
                </div>

                <p className="mt-3 text-center text-[10px] text-muted-foreground">
                  ※画像の選手はAIで生成しております。
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="p-4 md:p-6 text-center text-muted-foreground text-sm">
        <div className="flex justify-center items-center space-x-4 sm:space-x-6 mb-4 text-xs sm:text-sm">
          <Link
            href="https://www.footballtop.net/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors whitespace-nowrap"
          >
            利用規約
          </Link>
          <Link
            href="https://www.locofootball.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors whitespace-nowrap"
          >
            プライバシーポリシー
          </Link>
          <Link href="/tokusho" className="hover:text-primary transition-colors whitespace-nowrap">
            特定商取引法に基づく表記
          </Link>
        </div>
        <p>&copy; {new Date().getFullYear()} Your Club Site. All rights reserved.</p>
      </footer>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { Button } from "@/components/ui/button";
import { Shield, Plus, Check, ChevronRight, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

function formatSeasonRange(start: string | null | undefined, latest: string | null | undefined): string {
  if (!start && !latest) return "未設定";
  if (start && !latest) return `${start}〜`;
  if (start && latest && start !== latest) return `${start} 〜 ${latest}`;
  return start || latest || "未設定";
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { activeCareer, careers, loading, error, switchCareer } = useCareer();
  const router = useRouter();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const handleSwitch = async (careerId: string) => {
    if (careerId === activeCareer?.id) return;
    setSwitchingId(careerId);
    try {
      await switchCareer(careerId);
      toast.success("Careerを切り替えました");
      router.push("/admin");
    } catch (e) {
      toast.error("Careerの切り替えに失敗しました");
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="-m-4 min-h-full bg-[#F3F4F7] p-4 text-gray-900 sm:-m-6 sm:p-6 md:-m-8 md:p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight text-gray-950">プロフィール</h1>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100">
              {user?.photoURL ? (
                <Image src={user.photoURL} alt={user.displayName || ""} fill className="object-cover" sizes="80px" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <UserIcon className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col items-center gap-1 sm:items-start">
              <div className="text-xl font-bold text-gray-950">{user?.displayName || "ユーザー"}</div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                  {user?.plan === "pro" ? "Pro Member" : "Free Member"}
                </span>
                <span>{careers.length} Careers</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="hidden rounded-xl border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:flex"
              onClick={() => toast.info("プロフィール編集は次回実装予定です")}
            >
              プロフィールを編集
            </Button>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-950">あなたのキャリア</h2>
            <Button
              asChild
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Link href="/admin/careers/new" className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                新しいCareer
              </Link>
            </Button>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
              {error}
            </div>
          ) : loading ? (
            <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">読み込み中...</div>
          ) : careers.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">
              Careerがありません。新しいCareerを作成してください。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {careers.map((career) => {
                const isActive = career.id === activeCareer?.id;
                return (
                  <div
                    key={career.id}
                    className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition ${
                      isActive ? "border-emerald-500 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-100">
                          {career.clubLogo ? (
                            <Image
                              src={career.clubLogo}
                              alt={career.clubName}
                              fill
                              className="object-contain"
                              sizes="48px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <Shield className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-bold text-gray-950">
                            {career.name}
                            {career.id === activeCareer?.id && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                使用中
                              </span>
                            )}
                          </div>
                          <div className="truncate text-sm font-semibold text-slate-600">{career.clubName}</div>
                          {career.clubId && (
                            <div className="text-xs text-slate-400">
                              {typeof window !== "undefined" ? window.location.origin : "https://..."}/{career.clubId}
                            </div>
                          )}
                          {career.status === "creating" && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              作成中（コピー未完了）
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-1 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-700">{formatSeasonRange(career.startSeason, career.latestSeason)}</span>
                      </div>
                      <div>{career.seasonCount} Seasons</div>
                    </div>

                    <div className="mt-auto flex items-center gap-2 pt-4">
                      {isActive ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                            <Check className="h-3 w-3" />
                            使用中
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto flex items-center gap-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
                            asChild
                          >
                            <Link href="/admin/careers">
                              Careerを管理
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </>
                      ) : career.status === "creating" ? (
                        <span className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700">
                          作成完了後に切り替え可能です
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full rounded-lg bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
                          disabled={switchingId === career.id}
                          onClick={() => handleSwitch(career.id)}
                        >
                          {switchingId === career.id ? "切り替え中..." : "このCareerに切り替える"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

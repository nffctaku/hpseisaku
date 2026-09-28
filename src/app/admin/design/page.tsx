"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from "@/contexts/ClubContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { LayoutTab } from "@/app/admin/club/info/components/LayoutTab";
import {
  ArrowLeftRight, Calendar, ChevronRight, Flag, Handshake,
  Home, LayoutGrid, LineChart, ListOrdered, Monitor, Newspaper, Pencil,
  Settings, Shield, Tv, Users,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminDesignPage() {
  const { user, refreshUserProfile } = useAuth();
  const { clubInfo, clubProfileId } = useClub();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [homeBgColor, setHomeBgColor] = useState<string>("");
  const [homeColorTheme, setHomeColorTheme] = useState<'dark' | 'light'>('light');
  const [headerLayout, setHeaderLayout] = useState<'center' | 'left'>('left');
  const [homeLayout, setHomeLayout] = useState<'default' | 'pattern2'>('default');
  const [savingLayout, setSavingLayout] = useState(false);
  const isSavingRef = useRef(false);

  const [menuShowNews, setMenuShowNews] = useState(true);
  const [menuShowTv, setMenuShowTv] = useState(true);
  const [menuShowClub, setMenuShowClub] = useState(true);
  const [menuShowTransfers, setMenuShowTransfers] = useState(true);
  const [menuShowMatches, setMenuShowMatches] = useState(true);
  const [menuShowTable, setMenuShowTable] = useState(true);
  const [menuShowStats, setMenuShowStats] = useState(true);
  const [menuShowSquad, setMenuShowSquad] = useState(true);
  const [menuShowPartner, setMenuShowPartner] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const clubId = clubProfileId;
      if (!clubId) return;
      try {
        const res = await fetch(`/api/public/club/${encodeURIComponent(clubId)}/menu-settings`, {
          method: "GET",
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as any;
          if (!cancelled) {
            const s = (json?.settings || {}) as any;
            setMenuShowNews(s.menuShowNews !== false);
            setMenuShowTv(s.menuShowTv !== false);
            setMenuShowClub(s.menuShowClub !== false);
            setMenuShowTransfers(s.menuShowTransfers !== false);
            setMenuShowMatches(s.menuShowMatches !== false);
            setMenuShowTable(s.menuShowTable !== false);
            setMenuShowStats(s.menuShowStats !== false);
            setMenuShowSquad(s.menuShowSquad !== false);
            setMenuShowPartner(s.menuShowPartner !== false);
          }
        }

        const docRef = doc(db, "club_profiles", clubId);
        const docSnap = await getDoc(docRef);
        if (!cancelled && docSnap.exists()) {
          const data = docSnap.data() as any;
          console.log("[admin/design] Loaded profile data by doc ID", { clubUid: clubId, headerLayout: data.headerLayout, homeBgColor: data.homeBgColor, homeColorTheme: data.homeColorTheme });
          setHomeBgColor(data.homeBgColor || "");
          if (data.homeColorTheme === "dark" || data.homeColorTheme === "light") {
            setHomeColorTheme(data.homeColorTheme);
          }
          if (data.headerLayout === "center" || data.headerLayout === "left") {
            setHeaderLayout(data.headerLayout);
          }
          if (data.homeLayout === "default" || data.homeLayout === "pattern1" || data.homeLayout === "pattern2") {
            setHomeLayout(data.homeLayout === "pattern1" ? "pattern2" : data.homeLayout);
          }
        } else {
          console.log("[admin/design] No profile data found", { clubUid: clubId });
        }
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [clubProfileId]);

  const save = async (payload: Record<string, any>) => {
    if (!auth.currentUser) {
      toast.error("ログインしていません。");
      return false;
    }

    isSavingRef.current = true;

    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/club/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as any)?.message || "更新に失敗しました。");
      }

      const okJson = (await res.json().catch(() => null)) as any;
      if (okJson) {
        console.log("[admin/design] /api/club/update ok", okJson);
        try {
          console.log("[admin/design] /api/club/update ok (json)", JSON.stringify(okJson));

          // Reload data from Firestore after successful save to ensure consistency
          const clubIdForReload = clubProfileId;
          if (clubIdForReload) {
            const docRef = doc(db, "club_profiles", clubIdForReload);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data() as any;
              console.log("[admin/design] Reloaded profile data", { clubUid: clubIdForReload, headerLayout: data.headerLayout, homeBgColor: data.homeBgColor, homeColorTheme: data.homeColorTheme });
              if (typeof data.homeBgColor === "string") {
                setHomeBgColor(data.homeBgColor);
              }
              if (data.homeColorTheme === "dark" || data.homeColorTheme === "light") {
                setHomeColorTheme(data.homeColorTheme);
              }
              if (data.headerLayout === "center" || data.headerLayout === "left") {
                setHeaderLayout(data.headerLayout);
              }
              if (data.homeLayout === "default" || data.homeLayout === "pattern1" || data.homeLayout === "pattern2") {
                setHomeLayout(data.homeLayout === "pattern1" ? "pattern2" : data.homeLayout);
              }
            }
          }
        } catch {
          // ignore reload errors
        }

        const clubIdForUpdate = okJson?.debug?.clubIdForUpdate;
        const clubSlugDocId = okJson?.debug?.writeTargets?.clubSlugDocId;
        toast(
          `debug clubIdForUpdate=${clubIdForUpdate || ""} clubSlugDocId=${clubSlugDocId || ""}`
        );
      }

      return true;
    } catch (e: any) {
      toast.error(e?.message || "保存に失敗しました");
      return false;
    } finally {
      isSavingRef.current = false;
    }
  };

  const saveLayout = async () => {
    setSavingLayout(true);
    const ok = await save({ homeBgColor, homeColorTheme, headerLayout, homeLayout });
    if (ok) toast.success("デザインを保存しました");
    setSavingLayout(false);
  };

  const menuRows = [
    { href: "/admin/design/top", label: "TOP", icon: Home, hasToggle: false },
    { href: "/admin/design/news", label: "News", icon: Newspaper, hasToggle: true, key: "menuShowNews", value: menuShowNews, setValue: setMenuShowNews },
    { href: "/admin/design/tv", label: "TV", icon: Tv, hasToggle: true, key: "menuShowTv", value: menuShowTv, setValue: setMenuShowTv },
    { href: "/admin/design/club", label: "Club", icon: Shield, hasToggle: true, key: "menuShowClub", value: menuShowClub, setValue: setMenuShowClub },
    { href: "/admin/design/transfers", label: "Transfer", icon: ArrowLeftRight, hasToggle: true, key: "menuShowTransfers", value: menuShowTransfers, setValue: setMenuShowTransfers },
    { href: "/admin/design/matches", label: "Matches", icon: Calendar, hasToggle: true, key: "menuShowMatches", value: menuShowMatches, setValue: setMenuShowMatches },
    { href: "/admin/design/table", label: "TABLE", icon: ListOrdered, hasToggle: true, key: "menuShowTable", value: menuShowTable, setValue: setMenuShowTable },
    { href: "/admin/design/stats", label: "Stats", icon: LineChart, hasToggle: true, key: "menuShowStats", value: menuShowStats, setValue: setMenuShowStats },
    { href: "/admin/design/squad", label: "Squad", icon: Users, hasToggle: true, key: "menuShowSquad", value: menuShowSquad, setValue: setMenuShowSquad },
    { href: "/admin/design/partner", label: "Partner", icon: Handshake, hasToggle: true, key: "menuShowPartner", value: menuShowPartner, setValue: setMenuShowPartner },
    { href: "/admin/design/results", label: "Results", icon: Flag, hasToggle: false },
  ];

  const saveButton = (
    <Button
      type="button"
      onClick={() => void saveLayout()}
      disabled={savingLayout}
      className="w-full bg-[#1fd760] font-bold text-[#080c14] hover:bg-[#17c054]"
    >
      {savingLayout ? "保存中..." : "デザインを保存する"}
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-5xl py-4 sm:py-8">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0d1b2e] to-[#08111f] p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-white">
            <LayoutGrid className="h-6 w-6 text-sky-400" aria-hidden="true" />
            デザイン
          </h1>
          <Link
            href="/admin"
            className="flex items-center gap-1 text-xs sm:text-sm text-slate-300 transition-colors hover:text-white"
          >
            管理画面トップへ
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Monitor className="h-5 w-5 text-sky-400" aria-hidden="true" />
                レイアウト
              </CardTitle>
              <CardDescription>公開HPトップの見た目を設定します。</CardDescription>
            </CardHeader>
            <CardContent>
              <LayoutTab
                homeBgColor={homeBgColor}
                setHomeBgColor={setHomeBgColor}
                homeColorTheme={homeColorTheme}
                setHomeColorTheme={setHomeColorTheme}
                headerLayout={headerLayout}
                setHeaderLayout={setHeaderLayout}
                homeLayout={homeLayout}
                setHomeLayout={setHomeLayout}
              />
              <div className="mt-6">{saveButton}</div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Settings className="h-5 w-5 text-sky-400" aria-hidden="true" />
                  ページ表示設定
                </CardTitle>
                <CardDescription>公開ページのメニュー表示を設定できます。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {menuRows.map((row: any) => {
                    const RowIcon = row.icon;
                    return (
                      <div
                        key={row.href}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <RowIcon className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                          <span className="font-medium">{row.label}</span>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          {row.hasToggle ? (
                            <Switch
                              checked={Boolean(row.value)}
                              disabled={!user || !clubInfo?.id || savingKey === row.key}
                              onCheckedChange={async (checked) => {
                                const next = checked === true;
                                row.setValue(next);
                                setSavingKey(row.key);
                                const ok = await save({
                                  displaySettings: {
                                    [row.key]: next,
                                  },
                                });
                                if (ok) toast.success("設定を保存しました");
                                setSavingKey(null);
                              }}
                            />
                          ) : (
                            <span className="text-xs text-white/70">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-6">
          <Link
            href="/admin/club/info"
            className="inline-flex items-center gap-2 rounded-full bg-[#1fd760] px-5 py-2 text-sm font-bold text-[#080c14] transition hover:bg-[#17c054]"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            編集
          </Link>
        </div>
      </div>
    </div>
  );
}

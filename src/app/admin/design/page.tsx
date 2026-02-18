"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from "@/contexts/ClubContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function AdminDesignPage() {
  const { user, refreshUserProfile } = useAuth();
  const { clubInfo } = useClub();
  const [savingKey, setSavingKey] = useState<string | null>(null);

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
      const clubId = clubInfo?.id;
      if (!clubId) return;
      try {
        const res = await fetch(`/api/public/club/${encodeURIComponent(clubId)}/menu-settings`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as any;
        if (cancelled) return;
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
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [clubInfo?.id]);

  const save = async (payload: Record<string, any>) => {
    if (!auth.currentUser) {
      toast.error("ログインしていません。");
      return false;
    }

    if (!clubInfo?.id) {
      toast.error("クラブIDの取得中です。少し待ってからもう一度お試しください。");
      return false;
    }
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/club/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          clubId: clubInfo.id,
          ...payload,
        }),
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
        } catch {
          // ignore
        }
        const keys = (okJson?.debug?.displaySettingsKeys as any) || [];
        if (Array.isArray(keys) && keys.length === 0) {
          toast.error("保存リクエストに displaySettings が入っていない可能性があります");
        }

        const clubIdForUpdate = okJson?.debug?.clubIdForUpdate;
        const clubSlugDocId = okJson?.debug?.writeTargets?.clubSlugDocId;
        toast(
          `debug clubIdForUpdate=${clubIdForUpdate || ""} clubSlugDocId=${clubSlugDocId || ""} keys=${Array.isArray(keys) ? keys.join(",") : ""}`
        );
      }

      if (refreshUserProfile) {
        await refreshUserProfile();
      }

      // Ensure UI reflects canonical persisted values even if user profile is stale
      if (clubInfo?.id) {
        try {
          const res2 = await fetch(`/api/public/club/${encodeURIComponent(clubInfo.id)}/menu-settings`, {
            method: "GET",
            cache: "no-store",
          });
          if (res2.ok) {
            const json2 = (await res2.json()) as any;
            const s2 = (json2?.settings || {}) as any;
            setMenuShowNews(s2.menuShowNews !== false);
            setMenuShowTv(s2.menuShowTv !== false);
            setMenuShowClub(s2.menuShowClub !== false);
            setMenuShowTransfers(s2.menuShowTransfers !== false);
            setMenuShowMatches(s2.menuShowMatches !== false);
            setMenuShowTable(s2.menuShowTable !== false);
            setMenuShowStats(s2.menuShowStats !== false);
            setMenuShowSquad(s2.menuShowSquad !== false);
            setMenuShowPartner(s2.menuShowPartner !== false);
          }
        } catch {
          // ignore
        }
      }
      return true;
    } catch (e: any) {
      toast.error(e?.message || "保存に失敗しました");
      return false;
    }
  };

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">デザイン</h1>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          管理画面トップへ
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ページ別デザイン</CardTitle>
          <CardDescription>各ページごとにデザインパターンを選択できます。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { href: "/admin/design/top", label: "TOP", hasToggle: false },
              { href: "/admin/design/news", label: "News", hasToggle: true, key: "menuShowNews", value: menuShowNews, setValue: setMenuShowNews },
              { href: "/admin/design/tv", label: "TV", hasToggle: true, key: "menuShowTv", value: menuShowTv, setValue: setMenuShowTv },
              { href: "/admin/design/club", label: "Club", hasToggle: true, key: "menuShowClub", value: menuShowClub, setValue: setMenuShowClub },
              { href: "/admin/design/transfers", label: "Transfer", hasToggle: true, key: "menuShowTransfers", value: menuShowTransfers, setValue: setMenuShowTransfers },
              { href: "/admin/design/matches", label: "Matchs", hasToggle: true, key: "menuShowMatches", value: menuShowMatches, setValue: setMenuShowMatches },
              { href: "/admin/design/table", label: "TABLE", hasToggle: true, key: "menuShowTable", value: menuShowTable, setValue: setMenuShowTable },
              { href: "/admin/design/stats", label: "Stats", hasToggle: true, key: "menuShowStats", value: menuShowStats, setValue: setMenuShowStats },
              { href: "/admin/design/squad", label: "Squad", hasToggle: true, key: "menuShowSquad", value: menuShowSquad, setValue: setMenuShowSquad },
              { href: "/admin/design/partner", label: "Partner", hasToggle: true, key: "menuShowPartner", value: menuShowPartner, setValue: setMenuShowPartner },
              { href: "/admin/design/results", label: "Results", hasToggle: false },
            ].map((row: any) => (
              <div
                key={row.href}
                className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/10 px-4 py-3 text-sm text-white"
              >
                <Link href={row.href} className="flex-1 min-w-0 hover:opacity-90 transition-opacity">
                  <span className="font-medium">{row.label}</span>
                </Link>

                <div className="flex items-center gap-3 shrink-0">
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

                  <Link href={row.href} className="text-xs text-white/70 hover:text-white transition-colors">
                    編集
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

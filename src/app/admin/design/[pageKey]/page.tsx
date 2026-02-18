"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from "@/contexts/ClubContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type PageKey =
  | "top"
  | "news"
  | "tv"
  | "club"
  | "transfers"
  | "matches"
  | "table"
  | "stats"
  | "squad"
  | "partner"
  | "results";

const PAGE_DEFS: Record<PageKey, { title: string; variantKey: string }> = {
  top: { title: "TOP", variantKey: "topPageVariant" },
  news: { title: "News", variantKey: "newsPageVariant" },
  tv: { title: "TV", variantKey: "tvPageVariant" },
  club: { title: "Club", variantKey: "clubPageVariant" },
  transfers: { title: "Transfer", variantKey: "transfersPageVariant" },
  matches: { title: "Matchs", variantKey: "matchesPageVariant" },
  table: { title: "TABLE", variantKey: "tablePageVariant" },
  stats: { title: "Stats", variantKey: "statsPageVariant" },
  squad: { title: "Squad", variantKey: "squadPageVariant" },
  partner: { title: "Partner", variantKey: "partnerPageVariant" },
  results: { title: "Results", variantKey: "resultsPageVariant" },
};

export default function AdminDesignSubPage() {
  const { pageKey } = useParams<{ pageKey: string }>();
  const key = (typeof pageKey === "string" ? pageKey : "").trim().toLowerCase() as PageKey;
  const def = (PAGE_DEFS as any)[key] as { title: string; variantKey: string } | undefined;

  const { user, refreshUserProfile } = useAuth();
  const { clubInfo } = useClub();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<string>("default");

  const current = useMemo(() => {
    if (!def) return null;
    const v = (user?.displaySettings as any)?.[def.variantKey];
    return typeof v === "string" && v.trim() ? String(v).trim() : "default";
  }, [def, user?.displaySettings]);

  useEffect(() => {
    if (!def) return;
    setValue(current || "default");
  }, [def, current]);

  const save = async (next: string) => {
    if (!def) return;
    if (!auth.currentUser) {
      toast.error("ログインしていません。");
      return;
    }

    if (!clubInfo?.id) {
      toast.error("クラブIDの取得中です。少し待ってからもう一度お試しください。");
      return;
    }

    setSaving(true);
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
          displaySettings: {
            [def.variantKey]: next,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as any)?.message || "更新に失敗しました。 ");
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

      toast.success("設定を保存しました");
      if (refreshUserProfile) {
        await refreshUserProfile();
      }
    } catch (e: any) {
      toast.error(e?.message || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!def) {
    return (
      <div className="container mx-auto py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold">デザイン</h1>
          <Link href="/admin/design" className="text-sm text-muted-foreground hover:text-foreground">
            デザイン一覧へ
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>ページが見つかりません</CardTitle>
            <CardDescription>URLが正しいか確認してください。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">{def.title} デザイン</h1>
        <Link href="/admin/design" className="text-sm text-muted-foreground hover:text-foreground">
          デザイン一覧へ
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>デザインパターン</CardTitle>
          <CardDescription>このページの表示デザインを選択します。</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={value} onValueChange={(v: string) => setValue(v)}>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="default" id="variant-default" />
              <Label htmlFor="variant-default">標準</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="v2" id="variant-v2" />
              <Label htmlFor="variant-v2">V2</Label>
            </div>
          </RadioGroup>

          <div className="mt-6 flex items-center gap-3">
            <Button
              type="button"
              disabled={saving || value === (current || "default")}
              onClick={() => void save(value)}
            >
              {saving ? "保存中..." : "保存"}
            </Button>
            <div className="text-xs text-muted-foreground">現在: {current || "default"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

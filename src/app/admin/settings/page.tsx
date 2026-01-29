"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const { user, refreshUserProfile } = useAuth();
  const [playerProfileLatest, setPlayerProfileLatest] = useState(false);
  const [directoryListed, setDirectoryListed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const v = user?.displaySettings?.playerProfileLatest;
    setPlayerProfileLatest(v === true);
  }, [user?.displaySettings?.playerProfileLatest]);

  useEffect(() => {
    setDirectoryListed(user?.directoryListed === true);
  }, [user?.directoryListed]);

  const save = async (payload: Record<string, any>) => {
    if (!auth.currentUser) {
      toast.error("ログインしていません。");
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
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as any)?.message || "更新に失敗しました。");
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

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">設定</h1>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          管理画面トップへ
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>表示設定</CardTitle>
          <CardDescription>表示に関する設定を変更できます。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-white/60 p-4">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-1">
                <Label className="text-sm">選手プロフィール</Label>
                <div className="text-sm font-medium text-gray-900">最新の表示にする</div>
                <div className="text-xs text-muted-foreground">
                  ONにすると、選手詳細ページの表示を最新デザインに切り替えます。
                </div>
              </div>
              <Switch
                checked={playerProfileLatest}
                disabled={saving || !user}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setPlayerProfileLatest(next);
                  void save({
                    displaySettings: {
                      playerProfileLatest: next,
                    },
                  });
                }}
              />
            </div>
          </div>

          <div className="rounded-md border bg-white/60 p-4 mt-4">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-1">
                <Label className="text-sm">クラブHP</Label>
                <div className="text-sm font-medium text-gray-900">HP一覧ページに掲載する</div>
                <div className="text-xs text-muted-foreground">
                  ONにすると、一般公開のHP一覧ページ（/clubs）にあなたのクラブHPが表示されます。
                </div>
              </div>
              <Switch
                checked={directoryListed}
                disabled={saving || !user}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setDirectoryListed(next);
                  void save({ directoryListed: next });
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auth } from "@/lib/firebase";

type UserPointsDoc = {
  points?: number;
  matchPoints?: number;
  groupPoints?: number;
  displayName?: string;
  updatedAt?: any;
};

type RankingRow = {
  uid: string;
  points: number;
  displayName: string;
};

function normalizePoints(v: unknown): number {
  if (typeof v !== "number") return 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

function fallbackName(uid: string) {
  if (!uid) return "-";
  return uid.length <= 10 ? uid : `${uid.slice(0, 6)}...${uid.slice(-4)}`;
}

export default function AdminMyPage() {
  const { user, loading } = useAuth();
  const [myPoints, setMyPoints] = useState<number>(0);
  const [myMatchPoints, setMyMatchPoints] = useState<number>(0);
  const [myGroupPoints, setMyGroupPoints] = useState<number>(0);
  const [ranking, setRanking] = useState<RankingRow[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!user?.uid) return;

      const current = auth.currentUser;
      if (!current) return;

      const idToken = await current.getIdToken();
      const res = await fetch("/api/wc2026/user-points?limit=50", {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        throw new Error(data?.message || "ポイント取得に失敗しました");
      }

      setMyPoints(normalizePoints(data?.me?.points));
      setMyMatchPoints(normalizePoints(data?.me?.matchPoints));
      setMyGroupPoints(normalizePoints(data?.me?.groupPoints));

      const rows: RankingRow[] = Array.isArray(data?.ranking)
        ? data.ranking.map((r: any) => ({
            uid: String(r?.uid || ""),
            points: normalizePoints(r?.points),
            displayName: (typeof r?.displayName === "string" && r.displayName.trim()) || fallbackName(String(r?.uid || "")),
          }))
        : [];

      setRanking(rows);
    };

    void run();
  }, [user?.uid]);

  const myRank = useMemo(() => {
    if (!user?.uid) return null;
    const idx = ranking.findIndex((r) => r.uid === user.uid);
    return idx >= 0 ? idx + 1 : null;
  }, [ranking, user?.uid]);

  if (loading) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">マイページ</h1>
          <div className="mt-1 text-sm text-muted-foreground">/admin/mypage</div>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          管理画面トップへ
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>獲得ポイント</CardTitle>
            <CardDescription>ログインユーザーの合計ポイント</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{myPoints}</div>
            <div className="mt-3 rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700 space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-semibold">試合予想</div>
                <div className="font-bold">{myMatchPoints}P</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-semibold">GS 1位/2位</div>
                <div className="font-bold">{myGroupPoints}P</div>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">ランキング: {myRank ?? "-"} 位</div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>参加ユーザーランキング</CardTitle>
            <CardDescription>上位50</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead>ユーザー</TableHead>
                  <TableHead className="text-right">ポイント</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((r, idx) => {
                  const highlight = user?.uid && r.uid === user.uid;
                  return (
                    <TableRow key={r.uid} className={highlight ? "bg-sky-50" : undefined}>
                      <TableCell className="font-semibold">{idx + 1}</TableCell>
                      <TableCell className="truncate">{r.displayName}</TableCell>
                      <TableCell className="text-right font-bold">{r.points}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

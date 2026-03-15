"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { WC2026_MATCHES } from "@/lib/wc2026/data";
import {
  WC2026_RESULTS_STORAGE_KEY,
  clampScoreInput,
  dateTokenOfKickoffLabel,
  loadResultsFromLocalStorage,
  saveResultsToLocalStorage,
  stepScore,
  type ResultsByMatchId,
} from "@/lib/wc2026/results";
import { auth } from "@/lib/firebase";

export default function Wc2026ResultsAdminPage() {
  const [activeTab, setActiveTab] = useState<string>("matches");
  const [results, setResults] = useState<ResultsByMatchId>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setResults(loadResultsFromLocalStorage());
  }, []);

  useEffect(() => {
    saveResultsToLocalStorage(results);
  }, [results]);

  const matchesByDate = useMemo(() => {
    const map = new Map<string, (typeof WC2026_MATCHES)[number][]>();
    for (const m of WC2026_MATCHES) {
      const d = dateTokenOfKickoffLabel(m.kickoffLabel);
      const arr = map.get(d) ?? [];
      arr.push(m);
      map.set(d, arr);
    }
    return Array.from(map.entries());
  }, []);

  const handleReset = () => {
    localStorage.removeItem(WC2026_RESULTS_STORAGE_KEY);
    setResults({});
  };

  const handlePushToFirestore = async () => {
    if (!auth.currentUser) {
      toast.error("ログインしていません");
      return;
    }
    setSaving(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/wc2026/results", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ results }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as any)?.message || "反映に失敗しました");
      }
      toast.success("Firestoreへ反映しました");
    } catch (e: any) {
      toast.error(e?.message || "反映に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight">W杯2026 大会結果 管理</div>
          <div className="mt-1 text-sm text-gray-400">/admin/wc2026/results（localStorage）</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handlePushToFirestore} disabled={saving}>
            Firestoreへ反映
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            状態リセット
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="matches">試合結果入力</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="matches" className="mt-3">
          <div className="space-y-3">
            {matchesByDate.map(([dateToken, matches]) => (
              <Card key={dateToken} className="bg-white text-gray-900">
                <CardHeader>
                  <CardTitle className="text-base">{dateToken}</CardTitle>
                  <CardDescription>入力すると /wc2026 側に反映</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {matches.map((m) => {
                    const r = results[m.id] ?? { homeScore: "", awayScore: "" };

                    return (
                      <div key={m.id} className="rounded-lg border bg-gray-50 px-3 py-2">
                        <div className="text-sm font-semibold">{m.home.name} vs {m.away.name}</div>
                        <div className="text-[11px] text-gray-500">{m.kickoffLabel}</div>

                        <div className="mt-2 flex items-center gap-2">
                          <div className="inline-flex items-center rounded border bg-white overflow-hidden">
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-9 w-9 rounded-none px-0"
                              onClick={() =>
                                setResults((prev) => ({
                                  ...prev,
                                  [m.id]: { ...r, homeScore: stepScore(r.homeScore, -1) },
                                }))
                              }
                            >
                              -
                            </Button>
                            <Input
                              inputMode="numeric"
                              value={r.homeScore}
                              onChange={(e) =>
                                setResults((prev) => ({
                                  ...prev,
                                  [m.id]: { ...r, homeScore: clampScoreInput(e.target.value) },
                                }))
                              }
                              className="w-14 text-center border-0 rounded-none px-0"
                              placeholder=""
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-9 w-9 rounded-none px-0"
                              onClick={() =>
                                setResults((prev) => ({
                                  ...prev,
                                  [m.id]: { ...r, homeScore: stepScore(r.homeScore, 1) },
                                }))
                              }
                            >
                              +
                            </Button>
                          </div>

                          <div className="text-sm font-bold">-</div>

                          <div className="inline-flex items-center rounded border bg-white overflow-hidden">
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-9 w-9 rounded-none px-0"
                              onClick={() =>
                                setResults((prev) => ({
                                  ...prev,
                                  [m.id]: { ...r, awayScore: stepScore(r.awayScore, -1) },
                                }))
                              }
                            >
                              -
                            </Button>
                            <Input
                              inputMode="numeric"
                              value={r.awayScore}
                              onChange={(e) =>
                                setResults((prev) => ({
                                  ...prev,
                                  [m.id]: { ...r, awayScore: clampScoreInput(e.target.value) },
                                }))
                              }
                              className="w-14 text-center border-0 rounded-none px-0"
                              placeholder=""
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-9 w-9 rounded-none px-0"
                              onClick={() =>
                                setResults((prev) => ({
                                  ...prev,
                                  [m.id]: { ...r, awayScore: stepScore(r.awayScore, 1) },
                                }))
                              }
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="debug" className="mt-3">
          <Card className="bg-white text-gray-900">
            <CardHeader>
              <CardTitle className="text-base">Debug</CardTitle>
              <CardDescription>{WC2026_RESULTS_STORAGE_KEY}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 border p-3 text-xs leading-relaxed">
                {JSON.stringify(results, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

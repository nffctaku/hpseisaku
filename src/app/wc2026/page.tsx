"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { WC2026_GROUPS, WC2026_MATCHES } from "@/lib/wc2026/data";
import { WC2026_KNOCKOUT_MATCHES } from "@/lib/wc2026/knockout";
import {
  computeGroupStandings,
  dateTokenOfKickoffLabel,
  WC2026_RESULTS_STORAGE_KEY,
  type ResultsByMatchId,
  toScoreNumber,
} from "@/lib/wc2026/results";

export default function Wc2026Page() {
  const [results, setResults] = useState<ResultsByMatchId>({});

  useEffect(() => {
    let disposed = false;

    const loadFromLocal = () => {
      try {
        const raw = localStorage.getItem(WC2026_RESULTS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as ResultsByMatchId;
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    };

    const loadFromServer = async () => {
      try {
        const res = await fetch("/api/wc2026/results", { method: "GET" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.message || "結果の取得に失敗しました");
        const next = (data?.results && typeof data.results === "object" ? data.results : {}) as ResultsByMatchId;
        if (!disposed) setResults(next);
      } catch (e) {
        console.error("/wc2026 results fetch error", e);
        if (!disposed) setResults(loadFromLocal());
      }
    };

    void loadFromServer();
    const id = window.setInterval(() => {
      void loadFromServer();
    }, 30000);

    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, []);

  const standingsByGroup = useMemo(() => {
    return computeGroupStandings({ groups: WC2026_GROUPS, matches: WC2026_MATCHES, results });
  }, [results]);

  const placementMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [groupKey, rows] of Object.entries(standingsByGroup)) {
      const r1 = rows[0];
      const r2 = rows[1];
      const r3 = rows[2];
      if (r1) map.set(`1${groupKey}`, r1.teamName);
      if (r2) map.set(`2${groupKey}`, r2.teamName);
      if (r3) map.set(`3${groupKey}`, r3.teamName);
    }
    return map;
  }, [standingsByGroup]);

  const thirdQualifiers = useMemo(() => {
    const rows: { groupKey: string; teamName: string; pts: number; gd: number; gf: number }[] = [];
    for (const [groupKey, r] of Object.entries(standingsByGroup)) {
      const third = r[2];
      if (!third) continue;
      rows.push({ groupKey, teamName: third.teamName, pts: third.pts, gd: third.gd, gf: third.gf });
    }
    rows.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamName.localeCompare(b.teamName);
    });
    return rows.slice(0, 8);
  }, [standingsByGroup]);

  const thirdTeamByGroup = useMemo(() => {
    const set = new Set(thirdQualifiers.map((r) => r.groupKey));
    const map = new Map<string, string>();
    for (const g of set) {
      const name = placementMap.get(`3${g}`);
      if (name) map.set(g, name);
    }
    return map;
  }, [placementMap, thirdQualifiers]);

  const resolvedThirdSlots = useMemo(() => {
    const usedGroups = new Set<string>();
    const slotKeyToTeamName = new Map<string, string>();

    for (const m of WC2026_KNOCKOUT_MATCHES) {
      for (const slot of [m.home, m.away] as const) {
        if (slot.kind !== "third") continue;
        const key = slot.groups;
        if (slotKeyToTeamName.has(key)) continue;

        const candidates = thirdQualifiers
          .filter((t) => slot.groups.includes(t.groupKey))
          .filter((t) => !usedGroups.has(t.groupKey));

        const picked = candidates[0];
        if (!picked) continue;
        const name = thirdTeamByGroup.get(picked.groupKey);
        if (!name) continue;

        usedGroups.add(picked.groupKey);
        slotKeyToTeamName.set(key, name);
      }
    }

    return slotKeyToTeamName;
  }, [thirdQualifiers, thirdTeamByGroup]);

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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight">W杯2026 大会結果</div>
          <div className="mt-1 text-sm text-gray-400">/wc2026</div>
        </div>
        <Button
          asChild
          type="button"
          className="bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-400"
        >
          <Link href="/wc2026/top">WC2026 TOPへ</Link>
        </Button>
      </div>

      <Tabs defaultValue="table" className="w-full">
        <TabsList>
          <TabsTrigger value="table">順位表</TabsTrigger>
          <TabsTrigger value="matches">試合結果</TabsTrigger>
          <TabsTrigger value="ko">決勝T</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(standingsByGroup).map(([groupKey, rows]) => {
              return (
                <Card key={groupKey} className="bg-white text-gray-900">
                  <CardHeader>
                    <CardTitle className="text-base">グループ {groupKey}</CardTitle>
                    <CardDescription>勝点→得失点→総得点</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">#</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead className="text-right">Pts</TableHead>
                          <TableHead className="text-right">GD</TableHead>
                          <TableHead className="text-right">GF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, idx) => (
                          <TableRow key={r.teamId}>
                            <TableCell className="font-semibold">{idx + 1}</TableCell>
                            <TableCell className="truncate">{r.teamName}</TableCell>
                            <TableCell className="text-right font-bold">{r.pts}</TableCell>
                            <TableCell className="text-right">{r.gd}</TableCell>
                            <TableCell className="text-right">{r.gf}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="matches" className="mt-3">
          <div className="space-y-3">
            {matchesByDate.map(([dateToken, matches]) => (
              <Card key={dateToken} className="bg-white text-gray-900">
                <CardHeader>
                  <CardTitle className="text-base">{dateToken}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {matches.map((m) => {
                    const r = results[m.id];
                    const hs = toScoreNumber(r?.homeScore ?? "");
                    const as = toScoreNumber(r?.awayScore ?? "");
                    const scoreLabel = hs === null || as === null ? "-" : `${hs} - ${as}`;

                    return (
                      <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border bg-gray-50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{m.home.name} vs {m.away.name}</div>
                          <div className="text-[11px] text-gray-500">{m.kickoffLabel}</div>
                        </div>
                        <div className="shrink-0 text-sm font-bold">{scoreLabel}</div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ko" className="mt-3">
          <div className="space-y-3">
            <Card className="bg-white text-gray-900">
              <CardHeader>
                <CardTitle className="text-base">決勝トーナメント</CardTitle>
                <CardDescription>GS順位から自動反映（3位枠は上位8チームから自動割当）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const labelOf = (m: (typeof WC2026_KNOCKOUT_MATCHES)[number], slot: (typeof m)["home"]) => {
                    if (slot.kind === "placement") return placementMap.get(slot.placement) ?? slot.placement;
                    if (slot.kind === "third") return resolvedThirdSlots.get(slot.groups) ?? `3${slot.groups}`;
                    if (slot.kind === "winner") return `W${slot.matchId}`;
                    return `L${slot.matchId}`;
                  };

                  const inSet = (set: Set<string>) => (m: (typeof WC2026_KNOCKOUT_MATCHES)[number]) => set.has(m.id);

                  const best32Ids = new Set([
                    "M73",
                    "M74",
                    "M75",
                    "M76",
                    "M77",
                    "M78",
                    "M79",
                    "M80",
                    "M81",
                    "M82",
                    "M83",
                    "M84",
                    "M85",
                    "M86",
                    "M87",
                    "M88",
                  ]);
                  const best16Ids = new Set(["M89", "M90", "M91", "M92", "M93", "M94", "M95", "M96"]);
                  const qfIds = new Set(["M97", "M98", "M99", "M100"]);
                  const sfIds = new Set(["M101", "M102"]);
                  const finalIds = new Set(["M104"]);
                  const thirdPlaceIds = new Set(["M103"]);

                  const sections: { title: string; matches: (typeof WC2026_KNOCKOUT_MATCHES) }[] = [
                    { title: "ベスト32", matches: WC2026_KNOCKOUT_MATCHES.filter(inSet(best32Ids)) },
                    { title: "ベスト16", matches: WC2026_KNOCKOUT_MATCHES.filter(inSet(best16Ids)) },
                    { title: "準々決勝", matches: WC2026_KNOCKOUT_MATCHES.filter(inSet(qfIds)) },
                    { title: "準決勝", matches: WC2026_KNOCKOUT_MATCHES.filter(inSet(sfIds)) },
                    { title: "3位決定戦", matches: WC2026_KNOCKOUT_MATCHES.filter(inSet(thirdPlaceIds)) },
                    { title: "決勝", matches: WC2026_KNOCKOUT_MATCHES.filter(inSet(finalIds)) },
                  ];

                  return (
                    <div className="space-y-4">
                      {sections.map((s) => (
                        <div key={s.title} className="space-y-2">
                          <div className="text-sm font-bold text-gray-800">{s.title}</div>
                          <div className="space-y-2">
                            {s.matches.map((m) => (
                              <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border bg-gray-50 px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold truncate">{labelOf(m, m.home)} vs {labelOf(m, m.away)}</div>
                                  <div className="text-[11px] text-gray-500">{m.kickoffLabel} / {m.id}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

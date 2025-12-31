"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { TeamStat } from "@/types/match";

interface CompetitionDoc {
  id: string;
  name: string;
  season?: string;
}

interface MatchForAnalysis {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionSeason?: string;
  homeTeamId: string;
  awayTeamId: string;
  matchDate: string;
  teamStats?: TeamStat[];
}

type AggMode = "sum" | "avg";

const avgStatIds = new Set<string>(["possession", "passAccuracy"]);

function parseNumberMaybe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default function AnalysisPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [competitions, setCompetitions] = useState<CompetitionDoc[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);

  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("all");

  const [displayMode, setDisplayMode] = useState<AggMode>("sum");

  const [mainTeamId, setMainTeamId] = useState<string>("");
  const [matches, setMatches] = useState<MatchForAnalysis[]>([]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Resolve owner uid (admins may have ownerUid)
        const ownerUid = (user as any).ownerUid || user.uid;

        // Resolve mainTeamId from club_profiles.ownerUid==ownerUid
        let resolvedMainTeamId = "";
        try {
          const profilesRef = collection(db, "club_profiles");
          const qProfiles = query(profilesRef, where("ownerUid", "==", ownerUid), limit(1));
          const snap = await getDocs(qProfiles);
          if (!snap.empty) {
            const data = snap.docs[0].data() as any;
            if (typeof data.mainTeamId === "string" && data.mainTeamId.length > 0) {
              resolvedMainTeamId = data.mainTeamId;
            }
          }
        } catch {
          // ignore
        }

        if (!resolvedMainTeamId) {
          // fallback: first team
          const teamsRef = query(collection(db, `clubs/${ownerUid}/teams`));
          const teamsSnap = await getDocs(teamsRef);
          if (!teamsSnap.empty) {
            resolvedMainTeamId = teamsSnap.docs[0].id;
          }
        }

        setMainTeamId(resolvedMainTeamId);

        // competitions
        const competitionsQueryRef = query(collection(db, `clubs/${ownerUid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQueryRef);
        const competitionsData: CompetitionDoc[] = competitionsSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: (data.name as string) || d.id,
            season: data.season as string | undefined,
          };
        });
        setCompetitions(competitionsData);

        const seasonSet = new Set<string>();
        competitionsData.forEach((c) => {
          if (typeof c.season === "string" && c.season.trim() !== "") seasonSet.add(c.season);
        });
        setSeasons(Array.from(seasonSet).sort((a, b) => a.localeCompare(b)));

        // matches
        const allMatches: MatchForAnalysis[] = [];
        for (const comp of competitionsData) {
          // Filter by selected season
          if (selectedSeason !== "all" && comp.season && comp.season !== selectedSeason) {
            continue;
          }
          // Filter by selected competition
          if (selectedCompetitionId !== "all" && comp.id !== selectedCompetitionId) {
            continue;
          }

          const roundsRef = query(collection(db, `clubs/${ownerUid}/competitions/${comp.id}/rounds`));
          const roundsSnap = await getDocs(roundsRef);

          for (const roundDoc of roundsSnap.docs) {
            const matchesRef = query(collection(db, `clubs/${ownerUid}/competitions/${comp.id}/rounds/${roundDoc.id}/matches`));
            const matchesSnap = await getDocs(matchesRef);

            for (const matchDoc of matchesSnap.docs) {
              const md = matchDoc.data() as any;
              allMatches.push({
                id: matchDoc.id,
                competitionId: comp.id,
                competitionName: comp.name,
                competitionSeason: comp.season,
                homeTeamId: md.homeTeam,
                awayTeamId: md.awayTeam,
                matchDate: md.matchDate,
                teamStats: md.teamStats as TeamStat[] | undefined,
              });
            }
          }
        }

        allMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
        setMatches(allMatches);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [user, selectedSeason, selectedCompetitionId]);

  const visibleCompetitions = useMemo(() => {
    if (selectedSeason === "all") return competitions;
    return competitions.filter((c) => c.season === selectedSeason);
  }, [competitions, selectedSeason]);

  useEffect(() => {
    if (selectedCompetitionId === "all") return;
    const ok = visibleCompetitions.some((c) => c.id === selectedCompetitionId);
    if (!ok) setSelectedCompetitionId("all");
  }, [visibleCompetitions, selectedCompetitionId]);

  const analysisRows = useMemo(() => {
    if (!mainTeamId) return [] as { id: string; name: string; mode: AggMode; matches: number; value: number }[];

    const agg = new Map<
      string,
      {
        id: string;
        name: string;
        mode: AggMode;
        sum: number;
        count: number;
      }
    >();

    let matchesCount = 0;

    for (const m of matches) {
      const isHome = m.homeTeamId === mainTeamId;
      const isAway = m.awayTeamId === mainTeamId;
      if (!isHome && !isAway) continue;
      matchesCount += 1;

      if (!m.teamStats || !Array.isArray(m.teamStats)) continue;
      const sideKey = isHome ? "homeValue" : "awayValue";

      for (const s of m.teamStats) {
        const n = parseNumberMaybe((s as any)[sideKey]);
        if (n == null) continue;

        const key = String(s.id);
        const mode: AggMode = avgStatIds.has(key) ? "avg" : "sum";

        if (!agg.has(key)) {
          agg.set(key, {
            id: key,
            name: String(s.name || key),
            mode,
            sum: 0,
            count: 0,
          });
        }

        const row = agg.get(key)!;
        // keep latest name if changed
        if (typeof s.name === "string" && s.name.trim() !== "") row.name = s.name;
        row.sum += n;
        row.count += 1;
      }
    }

    const out = Array.from(agg.values())
      .map((r) => {
        const value = r.mode === "avg" ? (r.count > 0 ? r.sum / r.count : 0) : r.sum;
        return {
          id: r.id,
          name: r.name,
          mode: r.mode,
          matches: matchesCount,
          value,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return out;
  }, [matches, mainTeamId]);

  if (!user) {
    return <div className="py-6 text-center text-muted-foreground">ログインが必要です。</div>;
  }

  return (
    <div className="py-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="font-semibold">分析管理</div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Select value={displayMode} onValueChange={(v) => setDisplayMode(v as AggMode)}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="表示を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sum">合計</SelectItem>
              <SelectItem value="avg">1試合平均</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="シーズンを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのシーズン</SelectItem>
              {seasons.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="大会を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての大会</SelectItem>
              {visibleCompetitions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.season ? `${c.name} (${c.season})` : c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span>集計中...</span>
        </div>
      ) : !mainTeamId ? (
        <div className="text-center py-10 text-muted-foreground">自チームが未設定です。（クラブ情報でメインチーム設定を確認してください）</div>
      ) : analysisRows.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">対象試合のスタッツがありません。</div>
      ) : (
        <div className="bg-white text-gray-900 border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>項目</TableHead>
                <TableHead className="text-right">種別</TableHead>
                <TableHead className="text-right">値</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysisRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">
                    {r.mode === "avg" ? "平均" : displayMode === "avg" ? "1試合平均" : "合計"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.mode === "avg"
                      ? `${r.value.toFixed(1)}%`
                      : displayMode === "avg"
                        ? (r.matches > 0 ? (r.value / r.matches).toFixed(1) : "0.0")
                        : Math.round(r.value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

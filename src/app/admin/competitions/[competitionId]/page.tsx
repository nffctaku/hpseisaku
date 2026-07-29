"use client";

import { useState, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, updateDoc, addDoc, setDoc, increment } from "firebase/firestore";
import { useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, ChevronRight, PlusCircle, AlertTriangle, Upload, Download } from 'lucide-react';
import Link from 'next/link';
import { toast } from "sonner";
import { format, parse, isValid } from 'date-fns';
import { MatchEditor } from '@/components/match-editor';
import { Match, Team } from '@/types/match';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Define TypeScript interfaces
interface Competition {
  id: string;
  name: string;
  season: string;
  format?: 'league' | 'cup' | 'league_cup';
  teams?: string[]; // Array of team IDs
}

interface Round {
  id: string;
  name: string;
  matches: Match[];
}

type MatchIndexRow = {
  matchId: string;
  competitionId: string;
  roundId: string;
  matchDate: string;
  matchTime?: string;
  competitionName?: string;
  roundName?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
};

function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return rows;

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];
      if (inQuotes) {
        if (c === '"') {
          if (next === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          result.push(current);
          current = '';
        } else {
          current += c;
        }
      }
    }
    result.push(current);
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim().replace(/^\uFEFF/, ''));
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const formats = ['yyyy-MM-dd', 'yyyy/MM/dd', 'M/d/yyyy', 'MM/dd/yyyy', 'yyyy年M月d日'];
  for (const fmt of formats) {
    const d = parse(raw, fmt, new Date());
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }
  return null;
}

function getRoundSortKey(name: string): number {
  const s = (name || '').trim();
  if (!s) return Number.POSITIVE_INFINITY;

  const league = s.match(/^第?\s*(\d+)\s*節$/);
  if (league) return Number(league[1]);

  const cup = s.match(/^第?\s*(\d+)\s*回戦$/);
  if (cup) return 100 + Number(cup[1]);

  const special: Record<string, number> = {
    '予選': 10,
    '予備予選': 5,
    'プレーオフ': 700,
    'ラウンド16': 800,
    'ベスト16': 800,
    '準々決勝': 900,
    '準決勝': 950,
    '3位決定戦': 975,
    '決勝': 1000,
  };
  if (s in special) return special[s];

  return 100000;
}

function isLeagueRoundName(name: string | undefined): boolean {
  const s = (name || '').trim();
  if (!s) return false;
  return /^第?\s*(\d+)\s*節$/.test(s);
}

export default function CompetitionDetailPage() {
  const { user, ownerUid } = useAuth();
  const params = useParams();
  const competitionId = params.competitionId as string;

  const clubUid = ownerUid || user?.uid;

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [allTeams, setAllTeams] = useState<Map<string, Team>>(new Map());
  const [competitionTeams, setCompetitionTeams] = useState<Team[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAllData = async () => {
    if (!user || !competitionId || !clubUid) return;
    setLoading(true);
    try {
      const teamsMap = new Map<string, Team>();
      try {
        // Fetch all teams first to create a map
        const allTeamsPath = `clubs/${clubUid}/teams`;
        const allTeamsQuery = query(collection(db, allTeamsPath));
        const allTeamsSnap = await getDocs(allTeamsQuery);
        allTeamsSnap.forEach(doc => teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team));
        setAllTeams(teamsMap);
      } catch (e) {
        console.error('[CompetitionDetailPage] Failed to fetch teams', { clubUid, path: `clubs/${clubUid}/teams`, error: e });
        throw e;
      }


      // Then fetch the competition
      let fetchedCompetition: Competition | null = null;
      try {
        const compPath = `clubs/${clubUid}/competitions/${competitionId}`;
        const compRef = doc(db, compPath);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()) {
          fetchedCompetition = { id: compSnap.id, ...compSnap.data() } as Competition;
          setCompetition(fetchedCompetition);
        }
      } catch (e) {
        console.error('[CompetitionDetailPage] Failed to fetch competition', { clubUid, competitionId, path: `clubs/${clubUid}/competitions/${competitionId}`, error: e });
        throw e;
      }

      // Filter teams for the current competition
      if (fetchedCompetition && fetchedCompetition.teams) {
        const compTeams = fetchedCompetition.teams.map(id => teamsMap.get(id)).filter(Boolean) as Team[];
        // Also add the user's own team to the list, as it's now in the teamsMap
        const ownTeam = teamsMap.get(clubUid);
        if (ownTeam && !compTeams.some(t => t.id === clubUid)) {
          compTeams.push(ownTeam);
        }
        setCompetitionTeams(compTeams);
      }

      let roundsData: Round[] = [];
      try {
        const roundsPath = `clubs/${clubUid}/competitions/${competitionId}/rounds`;
        const roundsColRef = collection(db, roundsPath);
        const roundsSnap = await getDocs(query(roundsColRef));
        roundsData = await Promise.all(roundsSnap.docs.map(async (roundDoc) => {
          try {
            const matchesPath = `clubs/${clubUid}/competitions/${competitionId}/rounds/${roundDoc.id}/matches`;
            const matchesColRef = collection(db, matchesPath);
            const matchesSnap = await getDocs(query(matchesColRef));
            const matchesData = matchesSnap.docs.map(matchDoc => ({ id: matchDoc.id, ...matchDoc.data() } as Match));
            matchesData.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
            return { id: roundDoc.id, name: roundDoc.data().name, matches: matchesData };
          } catch (e) {
            console.error('[CompetitionDetailPage] Failed to fetch matches for round', { clubUid, competitionId, roundId: roundDoc.id, path: `clubs/${clubUid}/competitions/${competitionId}/rounds/${roundDoc.id}/matches`, error: e });
            throw e;
          }
        }));
      } catch (e) {
        console.error('[CompetitionDetailPage] Failed to fetch rounds', { clubUid, competitionId, path: `clubs/${clubUid}/competitions/${competitionId}/rounds`, error: e });
        throw e;
      }
      roundsData.sort((a, b) => {
        const ka = getRoundSortKey(a.name);
        const kb = getRoundSortKey(b.name);
        if (ka !== kb) return ka - kb;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
      setRounds(roundsData);
      if (roundsData.length > 0) {
        const hasMissingScore = (m: Match) => (m as any)?.scoreHome == null || (m as any)?.scoreAway == null;
        const isOwnMatch = (m: Match) => (m as any)?.homeTeam === user.uid || (m as any)?.awayTeam === user.uid;

        const ownMissingIndex = roundsData.findIndex((r) => r.matches?.some((m) => isOwnMatch(m) && hasMissingScore(m)));
        const anyMissingIndex = roundsData.findIndex((r) => r.matches?.some((m) => hasMissingScore(m)));

        setCurrentRoundIndex(ownMissingIndex >= 0 ? ownMissingIndex : anyMissingIndex >= 0 ? anyMissingIndex : 0);
      }
    } catch (error) {
      console.error("Error fetching data: ", error);
      toast.error("データの読み込みに失敗しました。");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, [user, competitionId]);

  const currentRound = useMemo(() => rounds[currentRoundIndex], [rounds, currentRoundIndex]);

  const canEditStandings = useMemo(() => {
    const fmt = competition?.format;
    if (fmt === 'cup') return false;
    if (fmt === 'league_cup') return isLeagueRoundName(currentRound?.name);
    return true;
  }, [competition?.format, currentRound?.name]);

  const excludedTeamIdsByMatchId = useMemo(() => {
    if (!currentRound?.matches) return new Map<string, Set<string>>();

    const allSelected = new Set<string>();
    for (const m of currentRound.matches) {
      if (typeof m.homeTeam === 'string' && m.homeTeam) allSelected.add(m.homeTeam);
      if (typeof m.awayTeam === 'string' && m.awayTeam) allSelected.add(m.awayTeam);
    }

    const map = new Map<string, Set<string>>();
    for (const m of currentRound.matches) {
      const excluded = new Set<string>(allSelected);
      if (typeof m.homeTeam === 'string' && m.homeTeam) excluded.delete(m.homeTeam);
      if (typeof m.awayTeam === 'string' && m.awayTeam) excluded.delete(m.awayTeam);
      map.set(m.id, excluded);
    }
    return map;
  }, [currentRound?.matches]);

  const syncPublicMatchIndex = async (roundId: string, matchId: string, patch?: Partial<Match>, roundNameOverride?: string) => {
    if (!user || !clubUid) return;

    const round = rounds.find((r) => r.id === roundId);
    const match = round?.matches.find((m) => m.id === matchId);
    const merged = { ...(match as any), ...(patch as any) } as any;

    const compName = competition?.name;
    const roundName = round?.name || roundNameOverride;

    const homeTeamId = typeof merged.homeTeam === 'string' ? merged.homeTeam : '';
    const awayTeamId = typeof merged.awayTeam === 'string' ? merged.awayTeam : '';
    const homeTeamInfo = homeTeamId ? allTeams.get(homeTeamId) : undefined;
    const awayTeamInfo = awayTeamId ? allTeams.get(awayTeamId) : undefined;

    const row: MatchIndexRow = {
      matchId,
      competitionId,
      roundId,
      matchDate: typeof merged.matchDate === 'string' ? merged.matchDate : '',
      matchTime: typeof merged.matchTime === 'string' ? merged.matchTime : undefined,
      competitionName: compName,
      roundName,
      homeTeam: homeTeamId,
      awayTeam: awayTeamId,
      homeTeamName: homeTeamInfo?.name || merged.homeTeamName,
      awayTeamName: awayTeamInfo?.name || merged.awayTeamName,
      homeTeamLogo: homeTeamInfo?.logoUrl || merged.homeTeamLogo,
      awayTeamLogo: awayTeamInfo?.logoUrl || merged.awayTeamLogo,
      scoreHome: typeof merged.scoreHome === 'number' ? merged.scoreHome : (merged.scoreHome ?? null),
      scoreAway: typeof merged.scoreAway === 'number' ? merged.scoreAway : (merged.scoreAway ?? null),
    };

    const rowForFirestore: any = { ...(row as any) };
    for (const k of Object.keys(rowForFirestore)) {
      if (rowForFirestore[k] === undefined) delete rowForFirestore[k];
    }

    const indexDocId = `${competitionId}__${roundId}__${matchId}`;
    const indexRef = doc(db, `clubs/${clubUid}/public_match_index`, indexDocId);
    await setDoc(indexRef, rowForFirestore, { merge: true });
  };

  const handleCsvDownload = async () => {
    if (!competition || !clubUid) return;

    const teamNameById = new Map<string, string>();
    try {
      const snap = await getDocs(collection(db, `clubs/${clubUid}/teams`));
      snap.docs.forEach((d) => {
        const data = d.data() as { name?: string; clubName?: string };
        teamNameById.set(d.id, data.name || data.clubName || d.id);
      });
    } catch (e) {
      console.warn('Failed to load team names for template:', e);
    }
    const toName = (id?: string) => (id ? teamNameById.get(id) || id : undefined);
    const t1 = toName(competition.teams?.[0]) || 'チームA';
    const t2 = toName(competition.teams?.[1]) || 'チームB';

    const escape = (s: string) => {
      const str = String(s);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const formatDate = (date: any) => {
      if (!date) return '';
      if (date instanceof Date) return date.toISOString().split('T')[0];
      if (typeof date.toDate === 'function') return date.toDate().toISOString().split('T')[0];
      if (typeof date === 'string') return date.split('T')[0];
      if (typeof date._seconds === 'number') return new Date(date._seconds * 1000).toISOString().split('T')[0];
      if (typeof date.seconds === 'number') return new Date(date.seconds * 1000).toISOString().split('T')[0];
      return '';
    };

    const getRoundSortKey = (roundName: string): number => {
      const match = roundName.match(/第(\d+)節/);
      if (match) return parseInt(match[1], 10);
      const match2 = roundName.match(/(\d+)節/);
      if (match2) return parseInt(match2[1], 10);
      return 999;
    };

    // Fetch existing rounds and matches
    let existingMatches: any[] = [];
    try {
      const roundsSnap = await getDocs(collection(db, `clubs/${clubUid}/competitions/${competitionId}/rounds`));
      const roundsData: Array<{ id: string; name: string; sortKey: number }> = [];
      roundsSnap.docs.forEach((roundDoc) => {
        const roundData = roundDoc.data();
        const roundName = roundData.name || roundDoc.id;
        roundsData.push({
          id: roundDoc.id,
          name: roundName,
          sortKey: getRoundSortKey(roundName),
        });
      });
      // Sort rounds by natural order
      roundsData.sort((a, b) => a.sortKey - b.sortKey);

      for (const round of roundsData) {
        const matchesSnap = await getDocs(collection(db, `clubs/${clubUid}/competitions/${competitionId}/rounds/${round.id}/matches`));
        matchesSnap.docs.forEach((matchDoc) => {
          const matchData = matchDoc.data();
          existingMatches.push({
            round: round.name,
            homeTeam: toName(matchData.homeTeam),
            awayTeam: toName(matchData.awayTeam),
            matchDate: formatDate(matchData.matchDate),
            scoreHome: matchData.scoreHome ?? '',
            scoreAway: matchData.scoreAway ?? '',
          });
        });
      }
    } catch (e) {
      console.warn('Failed to load existing matches for template:', e);
    }

    const headers = 'round,homeTeam,awayTeam,matchDate,scoreHome,scoreAway,participatingTeams\n';
    const existingRows = existingMatches
      .map((m) => `${escape(m.round)},${escape(m.homeTeam)},${escape(m.awayTeam)},${m.matchDate},${m.scoreHome},${m.scoreAway},\n`)
      .join('');
    const example = `第1節,${escape(t1)},${escape(t2)},2026-07-20,,,\n`;
    const teamListRows = (competition.teams || [])
      .map((id) => `,,,,,,${escape(toName(id) || id)}\n`)
      .join('');
    const content = '\uFEFF' + headers + existingRows + example + teamListRows;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_template_${competitionId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !competition || !clubUid) return;

    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      toast.error('CSVにデータが見つかりませんでした。');
      e.target.value = '';
      return;
    }

    const nameToTeam = new Map<string, Team>();
    const idToTeam = new Map<string, Team>();
    competitionTeams.forEach((t) => {
      if (t.name) nameToTeam.set(t.name.trim(), t);
      if (t.id) idToTeam.set(t.id.trim(), t);
    });

    const roundNameToRound = new Map<string, Round>();
    rounds.forEach((r) => roundNameToRound.set(r.name.trim(), r));
    const newRounds: Round[] = [];
    const matchesByRound = new Map<string, any[]>();
    const skipped: string[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];
      const homeRaw = row.homeTeam || row.home || row['ホーム'] || '';
      const awayRaw = row.awayTeam || row.away || row['アウェイ'] || '';

      if (!homeRaw.trim() && !awayRaw.trim()) continue;

      const roundRaw = row.round || row['節'] || row['ラウンド'] || '';
      const roundName = roundRaw.trim();

      let roundObj: Round | null = null;
      if (!roundName) {
        if (!currentRound) {
          skipped.push(`${i + 2}行目: 節が指定されていません`);
          continue;
        }
        roundObj = currentRound;
      } else if (roundNameToRound.has(roundName)) {
        roundObj = roundNameToRound.get(roundName)!;
      } else {
        try {
          const roundRef = await addDoc(collection(db, `clubs/${clubUid}/competitions/${competitionId}/rounds`), { name: roundName, matches: [] });
          const createdRound: Round = { id: roundRef.id, name: roundName, matches: [] };
          newRounds.push(createdRound);
          roundNameToRound.set(roundName, createdRound);
          roundObj = createdRound;
        } catch (error) {
          console.error('[CompetitionDetailPage] Error creating round:', { clubUid, competitionId, roundName, error });
          skipped.push(`${i + 2}行目: 節の作成に失敗しました`);
          continue;
        }
      }
      const dateRaw = row.matchDate || row.date || row['日付'] || '';
      const timeRaw = row.matchTime || row.time || row['時間'] || '';
      const scoreHomeRaw = row.scoreHome ?? row.homeScore ?? row['ホーム得点'] ?? '';
      const scoreAwayRaw = row.scoreAway ?? row.awayScore ?? row['アウェイ得点'] ?? '';

      const homeTeam = nameToTeam.get(homeRaw.trim()) || idToTeam.get(homeRaw.trim());
      const awayTeam = nameToTeam.get(awayRaw.trim()) || idToTeam.get(awayRaw.trim());
      if (!homeTeam || !awayTeam) {
        skipped.push(`${i + 2}行目: チームが見つかりません`);
        continue;
      }

      const date = normalizeDate(dateRaw);
      if (dateRaw && !date) {
        skipped.push(`${i + 2}行目: 日付が不正です`);
        continue;
      }

      let scoreHome: number | null = null;
      let scoreAway: number | null = null;
      if (scoreHomeRaw !== '') {
        const num = Number(scoreHomeRaw);
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
          skipped.push(`${i + 2}行目: ホーム得点が不正です`);
          continue;
        }
        scoreHome = num;
      }
      if (scoreAwayRaw !== '') {
        const num = Number(scoreAwayRaw);
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
          skipped.push(`${i + 2}行目: アウェイ得点が不正です`);
          continue;
        }
        scoreAway = num;
      }

      const newMatchData = {
        homeTeam: homeTeam.id,
        awayTeam: awayTeam.id,
        matchDate: date,
        matchTime: timeRaw || null,
        scoreHome,
        scoreAway,
        pkScoreHome: null,
        pkScoreAway: null,
        competitionId,
      };

      try {
        const matchesPath = `clubs/${clubUid}/competitions/${competitionId}/rounds/${roundObj.id}/matches`;
        const matchRef = await addDoc(collection(db, matchesPath), newMatchData);
        const newMatch = { id: matchRef.id, ...newMatchData };

        const list = matchesByRound.get(roundObj.id) || [];
        list.push(newMatch);
        matchesByRound.set(roundObj.id, list);

        try {
          await syncPublicMatchIndex(roundObj.id, matchRef.id, newMatch as any, roundObj.name);
        } catch (e) {
          console.warn('[CompetitionDetailPage] Failed to sync public_match_index (continuing):', e);
        }
      } catch (error) {
        console.error('[CompetitionDetailPage] Error adding CSV match:', { clubUid, competitionId, roundId: roundObj.id, row, error });
        skipped.push(`${i + 2}行目: 保存に失敗しました`);
      }
    }

    if (matchesByRound.size > 0 || newRounds.length > 0) {
      setRounds((prev) => {
        const nextMap = new Map(prev.map((r) => [r.id, r]));
        newRounds.forEach((r) => nextMap.set(r.id, r));
        const merged = Array.from(nextMap.values()).map((r) => {
          const added = matchesByRound.get(r.id);
          return added ? { ...r, matches: [...r.matches, ...added] } : r;
        });
        return merged;
      });
      try {
        await setDoc(doc(db, `clubs/${clubUid}`), { statsCacheVersion: increment(1) }, { merge: true });
      } catch (e) {
        console.warn('[CompetitionDetailPage] Failed to bump statsCacheVersion (continuing):', e);
      }
    }

    const totalAdded = [...matchesByRound.values()].reduce((a, v) => a + v.length, 0);
    let message = `CSVを取り込みました（合計 ${totalAdded} 件`;
    if (newRounds.length > 0) message += ` / 新規節 ${newRounds.length}`;
    message += '）';
    if (skipped.length > 0) message += ` / スキップ ${skipped.length} 件`;
    toast.success(message);
    if (skipped.length > 0) toast.error(`${skipped.length} 件の行をスキップしました。`);
    e.target.value = '';
  };

  const handleResetAllScores = async () => {
    if (!user || !competition || !clubUid) return;

    try {
      // まずローカル状態を即時更新してUIに反映
      setRounds(prevRounds => 
        prevRounds.map(round => ({
          ...round,
          matches: round.matches.map(match => ({
            ...match,
            scoreHome: null,
            scoreAway: null,
            status: 'scheduled' as const,
            homeTeamScore: null,
            awayTeamScore: null,
            isCompleted: false
          }))
        }))
      );

      // すべてのラウンドのすべての試合のスコアをリセット
      for (const round of rounds) {
        for (const match of round.matches) {
          const matchRef = doc(db, `clubs/${clubUid}/competitions/${competitionId}/rounds/${round.id}/matches`, match.id);
          await updateDoc(matchRef, {
            scoreHome: null,
            scoreAway: null,
            status: 'scheduled',
            homeTeamScore: null,
            awayTeamScore: null,
            isCompleted: false
          });
          
          // パブリックマッチインデックスも更新
          const indexDocId = `${competitionId}__${round.id}__${match.id}`;
          const indexRef = doc(db, `clubs/${clubUid}/public_match_index`, indexDocId);
          try {
            await updateDoc(indexRef, {
              scoreHome: null,
              scoreAway: null
            });
          } catch (e) {
            console.warn('[CompetitionDetailPage] Failed to update public_match_index (continuing):', {
              clubUid,
              competitionId,
              roundId: round.id,
              matchId: match.id,
              path: `clubs/${clubUid}/public_match_index/${indexDocId}`,
              error: e,
            });
          }
        }
      }

      toast.success("すべてのスコアをリセットしました");
      // データを再読み込みして完全同期
      await fetchAllData(); 
    } catch (error) {
      console.error("スコアリセットエラー:", error);
      toast.error("スコアのリセットに失敗しました");
      // エラー時はデータを再読み込みして状態を修正
      await fetchAllData();
    }
  };

  const handleMatchUpdate = async (matchId: string, field: keyof Match, value: any) => {
    if (!user || !currentRound || !clubUid) return;
    const roundId = currentRound.id;
    const matchRef = doc(db, `clubs/${clubUid}/competitions/${competitionId}/rounds/${roundId}/matches`, matchId);
    try {
      const normalizedValue =
        (field === 'scoreHome' || field === 'scoreAway' || field === 'pkScoreHome' || field === 'pkScoreAway') && typeof value === 'number'
          ? Math.max(0, value)
          : value;

      await updateDoc(matchRef, { [field]: normalizedValue });
      setRounds(prevRounds => prevRounds.map(r => r.id === roundId ? {
        ...r,
        matches: r.matches.map(m => m.id === matchId ? { ...m, [field]: normalizedValue } : m)
      } : r));

      try {
        await syncPublicMatchIndex(roundId, matchId, { [field]: normalizedValue } as any);
      } catch (e) {
        console.warn('[CompetitionDetailPage] Failed to sync public_match_index (continuing):', {
          clubUid,
          competitionId,
          roundId,
          matchId,
          path: `clubs/${clubUid}/public_match_index`,
          error: e,
        });
      }

      try {
        await setDoc(doc(db, `clubs/${clubUid}`), { statsCacheVersion: increment(1) }, { merge: true });
      } catch (e) {
        console.warn('[CompetitionDetailPage] Failed to bump statsCacheVersion (continuing):', {
          clubUid,
          path: `clubs/${clubUid}`,
          error: e,
        });
      }
      toast.success('更新しました。');
    } catch (error) {
      console.error(`Error updating match ${field}:`, error);
      toast.error('更新に失敗しました。');
    }
  };

  const handleAddRound = async () => {
    if (!user || !clubUid) return;
    const newRoundName = `第${rounds.length + 1}節`;
    const roundRef = await addDoc(collection(db, `clubs/${clubUid}/competitions`, competitionId, 'rounds'), { name: newRoundName });
    setRounds([...rounds, { id: roundRef.id, name: newRoundName, matches: [] }]);
    setCurrentRoundIndex(rounds.length);
    toast.success(`${newRoundName}を追加しました。`);
  };

  const handleAddMatch = async () => {
    if (!currentRound || !user || !clubUid) return;
    try {
      const lastMatchDate =
        Array.isArray(currentRound.matches) && currentRound.matches.length > 0
          ? currentRound.matches[currentRound.matches.length - 1]?.matchDate
          : undefined;
      const defaultMatchDate =
        typeof lastMatchDate === 'string' && lastMatchDate.trim().length > 0
          ? lastMatchDate
          : null;
      const newMatchData = { 
        homeTeam: '', awayTeam: '', 
        matchDate: defaultMatchDate, 
        competitionId, 
        scoreHome: null, scoreAway: null,
        pkScoreHome: null, pkScoreAway: null 
      };

      const matchesPath = `clubs/${clubUid}/competitions/${competitionId}/rounds/${currentRound.id}/matches`;
      const matchRef = await addDoc(collection(db, matchesPath), newMatchData);
      const newMatch = { id: matchRef.id, ...newMatchData };
      setRounds(prev => prev.map(r => r.id === currentRound.id ? {...r, matches: [...r.matches, newMatch] } : r));

      try {
        await syncPublicMatchIndex(currentRound.id, matchRef.id, newMatch as any);
      } catch (e) {
        console.warn('[CompetitionDetailPage] Failed to sync public_match_index (continuing):', {
          clubUid,
          competitionId,
          roundId: currentRound.id,
          matchId: matchRef.id,
          path: `clubs/${clubUid}/public_match_index`,
          error: e,
        });
      }

      try {
        await setDoc(doc(db, `clubs/${clubUid}`), { statsCacheVersion: increment(1) }, { merge: true });
      } catch (e) {
        console.warn('[CompetitionDetailPage] Failed to bump statsCacheVersion (continuing):', {
          clubUid,
          path: `clubs/${clubUid}`,
          error: e,
        });
      }

      toast.success('新しい試合を追加しました。');
    } catch (error) {
      console.error('[CompetitionDetailPage] Error adding match:', {
        clubUid,
        competitionId,
        roundId: currentRound.id,
        error,
      });
      toast.error('試合の追加に失敗しました。');
    }
  };

  
  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{competition?.name}</h1>
          <p className="text-muted-foreground">{competition?.season}</p>
        </div>
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
            onClick={handleCsvDownload}
            disabled={!competition || !clubUid}
          >
            <Download className="mr-2 h-4 w-4" />
            CSVダウンロード
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
            onClick={() => fileInputRef.current?.click()}
            disabled={!competition || !clubUid}
          >
            <Upload className="mr-2 h-4 w-4" />
            CSVインポート
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            ref={fileInputRef}
            className="hidden"
            onChange={handleCsvImport}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          大会日程をCSVファイルから登録・編集できます
        </p>
      </div>

      <div className="flex justify-between items-center bg-card p-2 rounded-lg mb-8">
        <Button variant="ghost" size="icon" onClick={() => setCurrentRoundIndex(p => Math.max(0, p - 1))} disabled={currentRoundIndex === 0}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Select value={currentRound?.id} onValueChange={(roundId) => setCurrentRoundIndex(rounds.findIndex(r => r.id === roundId))}>
          <SelectTrigger className="w-[180px] font-semibold text-lg">
            <SelectValue placeholder="節を選択" />
          </SelectTrigger>
          <SelectContent>
            {rounds.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={() => setCurrentRoundIndex(p => Math.min(rounds.length - 1, p + 1))} disabled={currentRoundIndex >= rounds.length - 1}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {currentRound && competition ? (
        <div className="space-y-6">
          <div className="space-y-3">
            {currentRound.matches.map(match => (
              <MatchEditor
                key={match.id}
                match={{ ...(match as any), competitionFormat: competition.format }}
                teams={competitionTeams}
                allTeamsMap={allTeams}
                excludedTeamIds={excludedTeamIdsByMatchId.get(match.id) ?? new Set()}
                roundId={currentRound.id}
                season={competition.season}
                onUpdate={handleMatchUpdate}
                onDelete={fetchAllData}
              />
            ))}
          </div>
          <Button variant="outline" className="w-full text-gray-900" onClick={handleAddMatch}><PlusCircle className="mr-2 h-4 w-4" />試合を追加</Button>
          {canEditStandings ? (
            <div>
              <Link href={`/admin/competitions/${competitionId}/standings`}>
                <Button className="w-full bg-green-600 text-white hover:bg-green-700">順位表を手動で更新・編集</Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-2">
                日程を登録せず、直接順位表を編集できます
              </p>
            </div>
          ) : null}
          
          <div className="flex justify-end mt-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full bg-red-600 hover:bg-red-700 text-white">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  すべての試合スコアをリセット
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>⚠️ すべての試合スコアをリセット</AlertDialogTitle>
                  <AlertDialogDescription>
                    この操作は<strong>元に戻せません</strong>。
                    <br /><br />
                    すべての試合スコアがリセットされます。
                    <br />
                    本当に実行してもよろしいですか？
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetAllScores} className="bg-red-600 hover:bg-red-700">
                    リセットを実行
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p>表示する節がありません。</p>
          <Button className="mt-4" onClick={handleAddRound}>最初の節を追加</Button>
        </div>
      )}
    </div>
  );
}

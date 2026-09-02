"use client";

import { useState, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, updateDoc, addDoc, setDoc, increment, deleteDoc } from "firebase/firestore";
import { useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, ChevronLeft, ChevronRight, PlusCircle, AlertTriangle, Upload, Download, CalendarDays, BarChart3, Lightbulb, MoreVertical, Pencil, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from "sonner";
import { format, parse, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
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
  const [pendingDeleteMatch, setPendingDeleteMatch] = useState<Match | null>(null);
  const [mobileScorePicker, setMobileScorePicker] = useState<{
    matchId: string;
    field: 'scoreHome' | 'scoreAway';
    value: string;
  } | null>(null);
  const [pressedPickerValue, setPressedPickerValue] = useState<string | null>(null);
  const [mobileTeamPicker, setMobileTeamPicker] = useState<{
    matchId: string;
    field: 'homeTeam' | 'awayTeam';
    value: string;
  } | null>(null);
  const [mobileDatePicker, setMobileDatePicker] = useState<{
    matchId: string;
    value: string;
  } | null>(null);
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

  const mobileMatchDateGroups = useMemo(() => {
    const groups = new Map<string, Match[]>();
    for (const match of currentRound?.matches ?? []) {
      const key = typeof match.matchDate === 'string' && match.matchDate ? match.matchDate : 'no-date';
      const list = groups.get(key) ?? [];
      list.push(match);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([date, matches]) => ({ date, matches }));
  }, [currentRound?.matches]);

  const formatMobileDate = (date: string) => {
    if (date === 'no-date') return '日付未設定';
    const parsed = parseISO(date);
    if (!isValid(parsed)) return date;
    return format(parsed, 'yyyy年M月d日(E)', { locale: ja });
  };

  const getTeamName = (teamId: string) => allTeams.get(teamId)?.name || '未設定';
  const getTeamLogo = (teamId: string) => allTeams.get(teamId)?.logoUrl;

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
    let createdCount = 0;
    let updatedCount = 0;
    
    // Fetch existing matches to check for duplicates
    const existingMatchesByRound = new Map<string, Map<string, any>>();
    for (const round of rounds) {
      const matchesMap = new Map<string, any>();
      for (const match of round.matches) {
        const key = `${match.homeTeam}-${match.awayTeam}`;
        matchesMap.set(key, match);
      }
      existingMatchesByRound.set(round.id, matchesMap);
    }

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
        const matchKey = `${homeTeam.id}-${awayTeam.id}`;
        const existingMatches = existingMatchesByRound.get(roundObj.id);
        const existingMatch = existingMatches?.get(matchKey);
        
        let newMatch: any;
        if (existingMatch) {
          // Update existing match
          await updateDoc(doc(db, matchesPath, existingMatch.id), newMatchData);
          newMatch = { id: existingMatch.id, ...newMatchData };
          updatedCount++;
        } else {
          // Create new match
          const matchRef = await addDoc(collection(db, matchesPath), newMatchData);
          newMatch = { id: matchRef.id, ...newMatchData };
          createdCount++;
        }

        const list = matchesByRound.get(roundObj.id) || [];
        list.push(newMatch);
        matchesByRound.set(roundObj.id, list);

        try {
          await syncPublicMatchIndex(roundObj.id, newMatch.id, newMatch as any, roundObj.name);
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
    let message = `CSVを取り込みました（新規 ${createdCount} 件 / 更新 ${updatedCount} 件）`;
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

  const handleDeleteMatch = async (match: Match) => {
    if (!user || !currentRound || !clubUid) return;
    try {
      await deleteDoc(doc(db, `clubs/${clubUid}/competitions/${competitionId}/rounds/${currentRound.id}/matches`, match.id));

      const indexDocId = `${competitionId}__${currentRound.id}__${match.id}`;
      try {
        await deleteDoc(doc(db, `clubs/${clubUid}/public_match_index`, indexDocId));
      } catch (e) {
        console.warn('[CompetitionDetailPage] Failed to delete public_match_index (continuing):', e);
      }

      try {
        await setDoc(doc(db, `clubs/${clubUid}`), { statsCacheVersion: increment(1) }, { merge: true });
      } catch (e) {
        console.warn('[CompetitionDetailPage] Failed to bump statsCacheVersion (continuing):', e);
      }

      setRounds(prev => prev.map(round => round.id === currentRound.id ? { ...round, matches: round.matches.filter(m => m.id !== match.id) } : round));
      setPendingDeleteMatch(null);
      toast.success('試合を削除しました。');
    } catch (error) {
      console.error('[CompetitionDetailPage] Error deleting match:', error);
      toast.error('試合の削除に失敗しました。');
    }
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
        matchDate: defaultMatchDate ?? '', 
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
    <div className="min-h-screen bg-[#0B1120] px-4 py-5 text-[#F3F4F6] sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 sm:mb-8">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#F3F4F6] sm:text-[32px]">{competition?.name}</h1>
          <p className="mt-1 text-base font-medium text-[#10B981] sm:mt-2 sm:text-sm sm:text-[#F3F4F6]/80">{competition?.season}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-[56px] justify-start rounded-lg border-white/10 bg-[#1F2937]/80 px-2 py-2 text-left text-[#F3F4F6] hover:bg-[#1F2937] hover:text-[#F3F4F6] sm:h-auto sm:px-5 sm:py-4"
            onClick={handleCsvDownload}
            disabled={!competition || !clubUid}
          >
            <Download className="h-4 w-4 stroke-[1.5] text-[#10B981]" />
            <span className="flex flex-col items-start">
              <span className="text-xs font-semibold sm:text-sm">CSVダウンロード</span>
              <span className="text-[10px] font-medium text-[#F3F4F6]/70 sm:text-xs">大会データを出力</span>
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-[56px] justify-start rounded-lg border-white/10 bg-[#1F2937]/80 px-2 py-2 text-left text-[#F3F4F6] hover:bg-[#1F2937] hover:text-[#F3F4F6] sm:h-auto sm:px-5 sm:py-4"
            onClick={() => fileInputRef.current?.click()}
            disabled={!competition || !clubUid}
          >
            <Upload className="h-4 w-4 stroke-[1.5] text-[#10B981]" />
            <span className="flex flex-col items-start">
              <span className="text-xs font-semibold sm:text-sm">CSVインポート</span>
              <span className="text-[10px] font-medium text-[#F3F4F6]/70 sm:text-xs">データを取り込み</span>
            </span>
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            ref={fileInputRef}
            className="hidden"
            onChange={handleCsvImport}
          />
        </div>

        <p className="mt-3 text-sm text-[#F3F4F6]/80 sm:mt-5">
          大会日程をCSVファイルから登録・編集できます
        </p>

        <div className="mt-4 rounded-xl border border-[#334155] bg-[#111827] p-3 sm:mt-5 sm:bg-[#1F2937]/70 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F3F4F6]">
              <CalendarDays className="h-5 w-5 stroke-[1.5] text-[#10B981]" />
              節の選択
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRound}
              title="節を追加"
              className="h-8 rounded-lg border-white/10 bg-[#0B1120]/80 px-3 text-xs font-medium text-[#F3F4F6] hover:bg-[#111827] hover:text-[#F3F4F6]"
            >
              <PlusCircle className="h-5 w-5 stroke-[1.5]" />
              節を追加
            </Button>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#334155] bg-[#0B1120] p-1.5 sm:gap-2 sm:p-2">
            <Button variant="ghost" size="icon" className="text-[#F3F4F6] hover:bg-white/10 hover:text-[#F3F4F6]" onClick={() => setCurrentRoundIndex(p => Math.max(0, p - 1))} disabled={currentRoundIndex === 0}>
              <ChevronLeft className="h-5 w-5 stroke-[1.5]" />
            </Button>
            <Select value={currentRound?.id} onValueChange={(roundId) => setCurrentRoundIndex(rounds.findIndex(r => r.id === roundId))}>
              <SelectTrigger className="h-10 flex-1 border-white/10 bg-[#0B1120]/70 text-center text-base font-semibold text-[#F3F4F6]">
                <SelectValue placeholder="節を選択" />
              </SelectTrigger>
              <SelectContent>
                {rounds.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="text-[#F3F4F6] hover:bg-white/10 hover:text-[#F3F4F6]" onClick={() => setCurrentRoundIndex(p => Math.min(rounds.length - 1, p + 1))} disabled={currentRoundIndex >= rounds.length - 1}>
              <ChevronRight className="h-5 w-5 stroke-[1.5]" />
            </Button>
          </div>
        </div>

        {currentRound && competition ? (
          <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
            <div className="space-y-2 md:hidden">
              {mobileMatchDateGroups.map((group) => (
                <div key={group.date} className="overflow-hidden rounded-lg border border-[#334155] bg-[#111827]">
                  <div className="flex h-9 items-center gap-2 bg-[#1F2937] px-3 text-[12px] font-semibold text-[#F8FAFC]">
                    <CalendarDays className="h-5 w-5 stroke-[1.5] text-[#F8FAFC]/90" />
                    {formatMobileDate(group.date)}
                  </div>
                  <div className="divide-y divide-[#334155]/70">
                    {group.matches.map((match) => {
                      const homeName = getTeamName(match.homeTeam);
                      const awayName = getTeamName(match.awayTeam);
                      const homeLogo = getTeamLogo(match.homeTeam);
                      const awayLogo = getTeamLogo(match.awayTeam);

                      return (
                        <div key={match.id} className="grid min-h-[60px] grid-cols-[minmax(55px,1fr)_20px_32px_6px_32px_20px_minmax(55px,1fr)_20px_16px] items-center gap-0.5 px-1 py-1.5 min-[390px]:grid-cols-[minmax(70px,1fr)_22px_36px_6px_36px_22px_minmax(70px,1fr)_24px_16px]">
                          <button
                            type="button"
                            onClick={() => {
                              setMobileTeamPicker({
                                matchId: match.id,
                                field: 'homeTeam',
                                value: match.homeTeam,
                              });
                            }}
                            className="min-w-0 text-right text-[11px] font-semibold leading-[1.15] text-[#F8FAFC] line-clamp-2 min-[390px]:text-[12px] sm:hidden"
                          >
                            {homeName || 'チームを選択'}
                          </button>
                          <div className="min-w-0 text-right text-[11px] font-semibold leading-[1.15] text-[#F8FAFC] line-clamp-2 min-[390px]:text-[12px] hidden sm:block">{homeName}</div>
                          <div className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full bg-[#1F2937] min-[390px]:h-6 min-[390px]:w-6">
                            {homeLogo ? <Image src={homeLogo} alt={homeName} width={24} height={24} className="h-full w-full object-contain" unoptimized /> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileScorePicker({
                                matchId: match.id,
                                field: 'scoreHome',
                                value: (match.scoreHome ?? '').toString(),
                              });
                            }}
                            className="h-[34px] w-[34px] rounded-md border border-[#334155] bg-[#0B1120] px-0 !text-center text-[16px] font-bold leading-[34px] text-[#F8FAFC] outline-none focus:border-[#60A5FA] min-[390px]:h-9 min-[390px]:w-9 min-[390px]:text-[17px] min-[390px]:leading-9 sm:hidden"
                          >
                            {match.scoreHome ?? '-'}
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={match.scoreHome ?? ''}
                            onChange={(e) => handleMatchUpdate(match.id, 'scoreHome', e.target.value === '' ? null : Number(e.target.value))}
                            style={{ textAlign: 'center' }}
                            className="h-[34px] w-[34px] appearance-none rounded-md border border-[#334155] bg-[#0B1120] px-0 !text-center text-[16px] font-bold leading-[34px] text-[#F8FAFC] outline-none focus:border-[#60A5FA] min-[390px]:h-9 min-[390px]:w-9 min-[390px]:text-[17px] min-[390px]:leading-9 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none hidden sm:inline-block"
                            aria-label={`${homeName}のスコア`}
                          />
                          <div className="text-center text-xs font-medium text-[#94A3B8]">-</div>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileScorePicker({
                                matchId: match.id,
                                field: 'scoreAway',
                                value: (match.scoreAway ?? '').toString(),
                              });
                            }}
                            className="h-[34px] w-[34px] rounded-md border border-[#334155] bg-[#0B1120] px-0 !text-center text-[16px] font-bold leading-[34px] text-[#F8FAFC] outline-none focus:border-[#60A5FA] min-[390px]:h-9 min-[390px]:w-9 min-[390px]:text-[17px] min-[390px]:leading-9 sm:hidden"
                          >
                            {match.scoreAway ?? '-'}
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={match.scoreAway ?? ''}
                            onChange={(e) => handleMatchUpdate(match.id, 'scoreAway', e.target.value === '' ? null : Number(e.target.value))}
                            style={{ textAlign: 'center' }}
                            className="h-[34px] w-[34px] appearance-none rounded-md border border-[#334155] bg-[#0B1120] px-0 !text-center text-[16px] font-bold leading-[34px] text-[#F8FAFC] outline-none focus:border-[#60A5FA] min-[390px]:h-9 min-[390px]:w-9 min-[390px]:text-[17px] min-[390px]:leading-9 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none hidden sm:inline-block"
                            aria-label={`${awayName}のスコア`}
                          />
                          <div className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full bg-[#1F2937] min-[390px]:h-6 min-[390px]:w-6">
                            {awayLogo ? <Image src={awayLogo} alt={awayName} width={24} height={24} className="h-full w-full object-contain" unoptimized /> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileTeamPicker({
                                matchId: match.id,
                                field: 'awayTeam',
                                value: match.awayTeam,
                              });
                            }}
                            className="min-w-0 text-left text-[11px] font-semibold leading-[1.15] text-[#F8FAFC] line-clamp-2 min-[390px]:text-[12px] sm:hidden"
                          >
                            {awayName || 'チームを選択'}
                          </button>
                          <div className="min-w-0 text-left text-[11px] font-semibold leading-[1.15] text-[#F8FAFC] line-clamp-2 min-[390px]:text-[12px] hidden sm:block">{awayName}</div>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileDatePicker({
                                matchId: match.id,
                                value: match.matchDate || '',
                              });
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1F2937] text-[#F8FAFC] hover:bg-[#334155] hover:text-[#F8FAFC] sm:hidden"
                            aria-label="日付を設定"
                          >
                            <CalendarDays className="h-4 w-4 stroke-[1.5]" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-6 text-[#F8FAFC] hover:bg-white/10 hover:text-[#F8FAFC]" aria-label="試合メニュー">
                                <MoreVertical className="h-5 w-5 stroke-[1.5]" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="border-[#334155] bg-[#111827] text-[#F8FAFC]">
                              <Link href={`/admin/competitions/${competitionId}/rounds/${currentRound.id}/matches/${match.id}`}>
                                <DropdownMenuItem className="cursor-pointer focus:bg-[#1F2937] focus:text-[#F8FAFC]">
                                  <Pencil className="h-4 w-4 stroke-[1.5]" />
                                  試合を編集
                                </DropdownMenuItem>
                              </Link>
                              <DropdownMenuItem className="cursor-pointer text-[#EF4444] focus:bg-[#1F2937] focus:text-[#EF4444]" onClick={() => setPendingDeleteMatch(match)}>
                                <Trash2 className="h-4 w-4 stroke-[1.5]" />
                                試合を削除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden space-y-3 md:block">
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

            <Button variant="outline" className="h-auto w-full justify-start rounded-xl border-dashed border-[#334155] bg-transparent px-4 py-3 text-[#F3F4F6] hover:bg-white/5 hover:text-[#F3F4F6] sm:px-5 sm:py-5" onClick={handleAddMatch}>
              <span className="mr-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#10B981]/15 text-[#F3F4F6] sm:h-11 sm:w-11">
                <PlusCircle className="h-5 w-5 stroke-[1.5]" />
              </span>
              <span className="flex flex-col items-start">
                <span className="text-sm font-semibold">試合を追加</span>
                <span className="text-xs font-medium text-[#F3F4F6]/70">この節に試合を追加する</span>
              </span>
            </Button>

            {canEditStandings ? (
              <Link href={`/admin/competitions/${competitionId}/standings`}>
                <Button className="h-auto w-full justify-between rounded-xl border border-[#10B981] bg-[#10B981]/15 px-4 py-3 text-[#F3F4F6] hover:bg-[#10B981]/25 hover:text-[#F3F4F6] sm:px-5 sm:py-5">
                  <span className="flex items-center gap-3">
                    <BarChart3 className="h-5 w-5 stroke-[1.5] text-[#10B981]" />
                    <span className="flex flex-col items-start">
                      <span className="text-sm font-semibold">順位表を手動で更新・編集</span>
                      <span className="text-xs font-medium text-[#F3F4F6]/70">試合結果を登録せず、順位表を直接編集できます。</span>
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 stroke-[1.5] text-[#10B981]" />
                </Button>
              </Link>
            ) : null}

            <AlertDialog open={!!pendingDeleteMatch} onOpenChange={(open) => !open && setPendingDeleteMatch(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>試合を削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={() => pendingDeleteMatch && handleDeleteMatch(pendingDeleteMatch)} className="bg-red-600 text-white hover:bg-red-700">
                    削除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="mt-3 sm:mt-4">
              <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="h-auto w-full justify-between rounded-xl border border-[#EF4444] bg-[#EF4444]/15 px-4 py-3 text-[#F3F4F6] hover:bg-[#EF4444]/25 hover:text-[#F3F4F6] sm:px-5 sm:py-5">
                  <span className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 stroke-[1.5] text-[#EF4444]" />
                    <span className="flex flex-col items-start">
                      <span className="text-sm font-semibold text-[#EF4444]">すべての試合スコアをリセット</span>
                      <span className="text-xs font-medium text-[#F3F4F6]/70">登録済みのすべての試合結果を削除します</span>
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 stroke-[1.5] text-[#EF4444]" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>すべての試合スコアをリセットしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetAllScores} className="bg-red-600 text-white hover:bg-red-700">
                    リセット
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-[#1F2937]/70 py-10 text-center text-[#F3F4F6]/80">
            <p className="text-sm">表示する節がありません。</p>
            <Button className="mt-4 bg-[#10B981] text-white hover:bg-[#10B981]/90" onClick={handleAddRound}>最初の節を追加</Button>
          </div>
        )}

      {/* Mobile Score Picker */}
      {mobileScorePicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 sm:hidden" onClick={() => setMobileScorePicker(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-[#f4f4f6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-12 items-center justify-between border-b border-slate-300/80 bg-white px-4">
              <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobileScorePicker(null)}>
                キャンセル
              </button>
              <div className="text-sm font-bold text-slate-500">スコアを選択</div>
              <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobileScorePicker(null)}>
                完了
              </button>
            </div>
            <div className="relative h-[56vh] overflow-y-auto px-5 py-[22vh] [scroll-snap-type:y_mandatory]">
              {Array.from({ length: 51 }, (_, i) => i).map((score) => {
                const isPressed = pressedPickerValue === score.toString();
                const isSelected = score.toString() === mobileScorePicker.value || (score.toString() === '0' && mobileScorePicker.value === '');
                return (
                  <button
                    key={score}
                    type="button"
                    onPointerDown={() => setPressedPickerValue(score.toString())}
                    onClick={() => {
                      setPressedPickerValue(score.toString());
                      window.setTimeout(() => {
                        handleMatchUpdate(
                          mobileScorePicker.matchId,
                          mobileScorePicker.field,
                          score === 0 ? null : score
                        );
                        setMobileScorePicker(null);
                        setPressedPickerValue(null);
                      }, 140);
                    }}
                    className={`block h-14 w-full scroll-mt-[22vh] [scroll-snap-align:center] truncate rounded-xl text-center text-[22px] font-bold leading-[56px] transition-colors ${isPressed ? 'bg-blue-500/25 text-blue-700' : isSelected ? 'bg-blue-500/10 text-blue-600' : 'text-slate-400'}`}
                  >
                    {score}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Team Picker */}
      {mobileTeamPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 sm:hidden" onClick={() => setMobileTeamPicker(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-[#f4f4f6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-12 items-center justify-between border-b border-slate-300/80 bg-white px-4">
              <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobileTeamPicker(null)}>
                キャンセル
              </button>
              <div className="text-sm font-bold text-slate-500">チームを選択</div>
              <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobileTeamPicker(null)}>
                完了
              </button>
            </div>
            <div className="relative h-[56vh] overflow-y-auto px-5 py-[22vh] [scroll-snap-type:y_mandatory]">
              {(() => {
                const currentMatch = currentRound?.matches.find(m => m.id === mobileTeamPicker.matchId);
                const excludedTeamIds = new Set<string>();
                currentRound?.matches.forEach(m => {
                  if (m.id !== mobileTeamPicker.matchId) {
                    if (m.homeTeam) excludedTeamIds.add(m.homeTeam);
                    if (m.awayTeam) excludedTeamIds.add(m.awayTeam);
                  }
                });
                const currentOpponent = mobileTeamPicker.field === 'homeTeam' 
                  ? (currentMatch?.awayTeam || null)
                  : (currentMatch?.homeTeam || null);
                if (currentOpponent) excludedTeamIds.add(currentOpponent);

                const availableTeams = competitionTeams.filter(t => !excludedTeamIds.has(t.id));

                return availableTeams.map((team) => {
                  const isPressed = pressedPickerValue === team.id;
                  const isSelected = team.id === mobileTeamPicker.value;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onPointerDown={() => setPressedPickerValue(team.id)}
                      onClick={() => {
                        setPressedPickerValue(team.id);
                        window.setTimeout(() => {
                          handleMatchUpdate(
                            mobileTeamPicker.matchId,
                            mobileTeamPicker.field,
                            team.id
                          );
                          setMobileTeamPicker(null);
                          setPressedPickerValue(null);
                        }, 140);
                      }}
                      className={`block h-14 w-full scroll-mt-[22vh] [scroll-snap-align:center] truncate rounded-xl text-center text-[22px] font-bold leading-[56px] transition-colors ${isPressed ? 'bg-blue-500/25 text-blue-700' : isSelected ? 'bg-blue-500/10 text-blue-600' : 'text-slate-400'}`}
                    >
                      {team.name}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Date Picker */}
      {mobileDatePicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 sm:hidden" onClick={() => setMobileDatePicker(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#F8FAFC]">日付を選択</h3>
              <button
                type="button"
                onClick={() => setMobileDatePicker(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1F2937] text-[#94A3B8] hover:bg-[#334155] hover:text-[#F8FAFC]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              type="date"
              value={mobileDatePicker.value}
              onChange={(e) => {
                handleMatchUpdate(mobileDatePicker.matchId, 'matchDate', e.target.value);
                setMobileDatePicker(null);
              }}
              className="w-full rounded-md border border-[#334155] bg-[#0B1120] px-4 py-3 text-[#F8FAFC] outline-none focus:border-[#60A5FA]"
            />
          </div>
        </div>
      )}

        <div className="mt-4 rounded-xl border border-white/10 bg-[#1F2937]/70 p-4 sm:mt-5 sm:p-5">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 stroke-[1.5] text-[#F3F4F6]/80" />
            <div>
              <h2 className="text-sm font-semibold text-[#F3F4F6]">使い方のヒント</h2>
              <p className="mt-2 text-xs font-medium leading-relaxed text-[#F3F4F6]/75">
                CSVファイルで一括登録するか、試合を個別に追加していくことができます。<br />
                順位表は手動で編集することで、リアルタイムに反映されます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

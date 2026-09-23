"use client";

import { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Player, MatchDetails } from '@/types/match';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCareer } from '@/contexts/CareerContext';
import { PlayerStatsTable } from './player-stats-table';
import { MatchEventsTable } from './match-events-table';
import { commitSquadSave, subEventsSignature, type SquadSaveSnapshot } from '@/lib/squad-save-merge';
import { healStaleTeamMinutes } from '@/lib/match-minutes';
import type { SubmitHandler } from 'react-hook-form';

const formSchema = z.object({
  customStatHeaders: z.array(z.object({ id: z.string(), name: z.string().min(1, '必須') })).max(15, '最大15項目です。'),
  homeFormation: z.string().optional(),
  awayFormation: z.string().optional(),
  playerStats: z.array(
    z.object({
      playerId: z.string(),
      playerName: z.string(),
      position: z.string(),
      teamId: z.string().optional(),
      role: z.string().optional(),
      starterSlot: z.coerce.number().int().min(0).max(10).optional(),
      rating: z.coerce.number().min(4.0).max(10.0).step(0.1).optional(),
      minutesPlayed: z.coerce.number().min(0).optional(),
      goals: z.coerce.number().min(0).optional(),
      assists: z.coerce.number().min(0).optional(),
      yellowCards: z.coerce.number().min(0).optional(),
      redCards: z.coerce.number().min(0).optional(),
      customStats: z.array(z.object({ id: z.string(), name: z.string(), value: z.string().optional() })).optional(),
    })
  ),
  events: z
    .array(
      z.object({
        id: z.string(),
        // 実データ上は number と "45+2" 等の文字列が混在するため両方許容
        minute: z.union([z.coerce.number().min(0).max(145), z.string()]),
        teamId: z.string(),
        type: z.enum(['goal', 'og', 'card', 'substitution', 'note', 'pk_miss']),
        playerId: z.string().optional(),
        playerName: z.string().optional(),
        assistPlayerId: z.string().optional(),
        assistPlayerName: z.string().optional(),
        cardColor: z.enum(['yellow', 'red']).optional(),
        inPlayerId: z.string().optional(),
        inPlayerName: z.string().optional(),
        outPlayerId: z.string().optional(),
        outPlayerName: z.string().optional(),
        text: z.string().optional(),
        originalPlayerId: z.string().optional(),
        goalKind: z.enum(['open', 'penalty', 'own_goal']).optional(),
        playerLinkStatus: z.enum(['linked', 'name_only', 'needs_input']).optional(),
        source: z.enum(['ocr', 'manual']).optional(),
        assistStatus: z.enum(['unknown', 'none', 'set']).optional(),
        needsConfirmation: z.boolean().optional(),
        minuteText: z.string().optional(),
      })
    )
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface SquadRegistrationFormProps {
  match: MatchDetails;
  homePlayers: Player[];
  awayPlayers: Player[];
  roundId: string;
  competitionId: string;
  matchDocPath?: string;
  seasonId?: string;
  view?: 'player' | 'events' | 'both';
}

export function SquadRegistrationForm({ match, homePlayers, awayPlayers, roundId, competitionId, matchDocPath, seasonId, view = 'both' }: SquadRegistrationFormProps) {
  console.log('SquadForm: Received homePlayers', homePlayers);
  console.log('SquadForm: Received awayPlayers', awayPlayers);
  const { user } = useAuth();
  const { activeCareer } = useCareer();
  // matchDocPath 未指定時のフォールバックもアクティブCareerのclubUidを使う（auth uid は旧Careerルートを指すため不可）
  const ownerUid = activeCareer?.clubUid || user?.uid;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [savedIndicatorVisible, setSavedIndicatorVisible] = useState(false);

   const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const autosaveReadyRef = useRef(false);
   const prevEventCountRef = useRef(0);
   // フォームロード時点のスナップショット。保存時に「ユーザーが変更した」と
   // 「外部（OCR確定・別タブ）が変更した」を3方向マージで区別するために使う。
   const loadedSnapshotRef = useRef<SquadSaveSnapshot | null>(null);
   const savingRef = useRef(false);
   const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';
  const seasonStorageKey = normalizedSeasonId ? `default_squad_${ownerUid}_${normalizedSeasonId}` : `default_squad_${ownerUid}`;
  const legacyStorageKey = `default_squad_${ownerUid}`;

  const positionOrder = (position: any) => {
    const value = String(position || '').toUpperCase();
    if (value.includes('GK')) return 0;
    if (value.includes('DF') || value.includes('CB') || value.includes('SB') || value.includes('RB') || value.includes('LB')) return 1;
    if (value.includes('MF') || value.includes('DM') || value.includes('CM') || value.includes('AM') || value.includes('WB') || value.includes('SH')) return 2;
    if (value.includes('FW') || value.includes('ST') || value.includes('CF') || value.includes('WG')) return 3;
    return 4;
  };

  const lineupSortValue = (ps: any, fallbackIndex: number) => {
    const role = ps?.role || 'starter';
    if (role === 'starter') {
      const slot = Number(ps?.starterSlot);
      if (Number.isInteger(slot) && slot >= 0 && slot <= 10) return slot;
      return 100 + positionOrder(ps?.position) * 10 + fallbackIndex;
    }
    return 1000 + fallbackIndex;
  };

  const sortLineupRows = (rows: any[]) => {
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => lineupSortValue(a.row, a.index) - lineupSortValue(b.row, b.index))
      .map(({ row }) => row);
  };

  // localStorageからデフォルトスタメン・サブ設定を読み込む
  const loadDefaultSquad = (teamPlayers: Player[], fallbackTeamId?: string): { playerStats: FormValues['playerStats']; formation: string } => {
    try {
      const saved = localStorage.getItem(seasonStorageKey) ?? localStorage.getItem(legacyStorageKey);
      if (saved) {
        const data = JSON.parse(saved);
        // チームIDを特定（引数のfallbackTeamIdを優先。無ければ最初の選手のteamId）
        let teamId = fallbackTeamId || teamPlayers[0]?.teamId;
        if (!teamId) return { playerStats: [], formation: '' };
        
        const teamDefaultSquad = data[teamId] || { starters: [], subs: [] };
        
        // デフォルトメンバーを構築
        const defaultPlayerStats: any[] = [];
        
        // スタメン
        (teamDefaultSquad.starters || []).forEach((playerId: string, index: number) => {
          const player = teamPlayers.find(p => p.id === playerId);
          if (player) {
            defaultPlayerStats.push({
              playerId: player.id,
              playerName: player.name,
              position: player.position || 'N/A',
              teamId: teamId,
              role: 'starter',
              starterSlot: index,
              rating: undefined,
              minutesPlayed: 90,
              goals: 0,
              assists: 0,
              yellowCards: 0,
              redCards: 0,
              customStats: [],
            });
          }
        });
        
        // サブ
        (teamDefaultSquad.subs || []).forEach((playerId: string) => {
          const player = teamPlayers.find(p => p.id === playerId);
          if (player) {
            defaultPlayerStats.push({
              playerId: player.id,
              playerName: player.name,
              position: player.position || 'N/A',
              teamId: teamId,
              role: 'sub',
              rating: undefined,
              minutesPlayed: 0,
              goals: 0,
              assists: 0,
              yellowCards: 0,
              redCards: 0,
              customStats: [],
            });
          }
        });
        
        return {
          playerStats: defaultPlayerStats,
          formation: typeof teamDefaultSquad.formation === 'string' ? teamDefaultSquad.formation : '',
        };
      }
    } catch (error) {
      console.error('Error loading default squad:', error);
    }
    return { playerStats: [], formation: '' };
  };

  // デフォルトスタメン・サブ設定を保存
  const saveDefaultSquad = (playerStats: FormValues['playerStats'], formations?: Record<string, string>) => {
    try {
      const existingData = localStorage.getItem(seasonStorageKey);
      const data = existingData ? JSON.parse(existingData) : {};

      const homePlayerIds = new Set((homePlayers || []).map((p) => p.id));
      const awayPlayerIds = new Set((awayPlayers || []).map((p) => p.id));
      const inferTeamId = (ps: any) => {
        const fromPs = typeof ps?.teamId === 'string' ? ps.teamId.trim() : '';
        if (fromPs) return fromPs;
        const pid = typeof ps?.playerId === 'string' ? ps.playerId : '';
        if (pid && homePlayerIds.has(pid)) return match.homeTeam;
        if (pid && awayPlayerIds.has(pid)) return match.awayTeam;
        return '';
      };
      
      // チームごとにスタメンとサブを分類
      const groupedRows = playerStats.reduce((acc: any, ps: any, index: number) => {
        const teamId = inferTeamId(ps);
        if (!teamId) return acc;
        
        if (!acc[teamId]) {
          acc[teamId] = [];
        }
        acc[teamId].push({ ...ps, __lineupIndex: index });
        return acc;
      }, {});

      const teamGroups = Object.keys(groupedRows).reduce((acc: any, teamId) => {
        const sortedRows = sortLineupRows(groupedRows[teamId]);
        acc[teamId] = {
          starters: sortedRows.filter((ps: any) => (ps.role || 'starter') === 'starter').map((ps: any) => ps.playerId),
          subs: sortedRows.filter((ps: any) => ps.role === 'sub').map((ps: any) => ps.playerId),
          formation: formations?.[teamId] || data[teamId]?.formation || '4-3-3',
        };
        return acc;
      }, {});
      
      // データを更新
      Object.keys(teamGroups).forEach(teamId => {
        data[teamId] = teamGroups[teamId];
      });
      
      localStorage.setItem(seasonStorageKey, JSON.stringify(data));

      // Also persist to legacy key (without season) so default can be applied on pages
      // where seasonId is not available.
      if (seasonStorageKey !== legacyStorageKey) {
        try {
          const legacyExisting = localStorage.getItem(legacyStorageKey);
          const legacyData = legacyExisting ? JSON.parse(legacyExisting) : {};
          Object.keys(teamGroups).forEach((teamId) => {
            legacyData[teamId] = teamGroups[teamId];
          });
          localStorage.setItem(legacyStorageKey, JSON.stringify(legacyData));
        } catch {
          // ignore legacy write errors
        }
      }
    } catch (error) {
      console.error('Error saving default squad:', error);
    }
  };

  const stripUndefinedDeep = <T,>(value: T): T => {
    if (value === undefined) return value;
    if (value === null) return value;
    if (Array.isArray(value)) {
      return value
        .map((v) => stripUndefinedDeep(v))
        .filter((v) => v !== undefined) as any;
    }
    if (typeof value === 'object') {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        return value;
      }
      const out: any = {};
      for (const [k, v] of Object.entries(value as any)) {
        if (v === undefined) continue;
        const vv = stripUndefinedDeep(v);
        if (vv === undefined) continue;
        out[k] = vv;
      }
      return out;
    }
    return value;
  };

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      customStatHeaders: [],
      playerStats: [],
      events: [],
      homeFormation: '4-3-3',
      awayFormation: '4-3-3',
    },
  });

  const watchedEvents = useWatch({ control: methods.control, name: 'events' });
  const watchedPlayerStats = useWatch({ control: methods.control, name: 'playerStats' });
  const watchedCustomStatHeaders = useWatch({ control: methods.control, name: 'customStatHeaders' });

  useEffect(() => {
    // Temporarily disabled to investigate React #185 infinite loop
    return;
    // eslint-disable-next-line no-unreachable
    const events: any[] = Array.isArray(watchedEvents) ? (watchedEvents as any[]) : [];
    const playerStats = (methods.getValues('playerStats') as any[]) || [];
    if (playerStats.length === 0) return;

    const goalCounts = new Map<string, number>();
    const assistCounts = new Map<string, number>();
    const yellowCounts = new Map<string, number>();
    const redCounts = new Map<string, number>();

    (events || []).forEach((ev: any) => {
      const type = typeof ev?.type === 'string' ? ev.type : '';

      if (type === 'goal') {
        if (ev.playerId) {
          goalCounts.set(ev.playerId, (goalCounts.get(ev.playerId) || 0) + 1);
        }
        if (ev.assistPlayerId) {
          assistCounts.set(ev.assistPlayerId, (assistCounts.get(ev.assistPlayerId) || 0) + 1);
        }
        return;
      }

      // card (new format) / yellow|red (legacy format)
      if ((type === 'card' || type === 'yellow' || type === 'red') && ev.playerId) {
        const color = type === 'card' ? ev.cardColor : type;
        if (color === 'yellow') {
          yellowCounts.set(ev.playerId, (yellowCounts.get(ev.playerId) || 0) + 1);
        }
        if (color === 'red') {
          redCounts.set(ev.playerId, (redCounts.get(ev.playerId) || 0) + 1);
        }
      }
    });

    playerStats.forEach((ps: any, index: number) => {
      const playerId = ps?.playerId;
      if (!playerId) return;

      const nextGoals = goalCounts.get(playerId) ?? 0;
      const nextAssists = assistCounts.get(playerId) ?? 0;
      const nextYellow = yellowCounts.get(playerId) ?? 0;
      const nextRed = redCounts.get(playerId) ?? 0;

      const curGoals = typeof ps?.goals === 'number' ? ps.goals : 0;
      const curAssists = typeof ps?.assists === 'number' ? ps.assists : 0;
      const curYellow = typeof ps?.yellowCards === 'number' ? ps.yellowCards : 0;
      const curRed = typeof ps?.redCards === 'number' ? ps.redCards : 0;

      if (curGoals !== nextGoals) {
        methods.setValue(`playerStats.${index}.goals` as any, nextGoals, { shouldDirty: false });
      }
      if (curAssists !== nextAssists) {
        methods.setValue(`playerStats.${index}.assists` as any, nextAssists, { shouldDirty: false });
      }
      if (curYellow !== nextYellow) {
        methods.setValue(`playerStats.${index}.yellowCards` as any, nextYellow, { shouldDirty: false });
      }
      if (curRed !== nextRed) {
        methods.setValue(`playerStats.${index}.redCards` as any, nextRed, { shouldDirty: false });
      }
    });
  }, [watchedEvents, methods]);

  useEffect(() => {
    const fetchMatchData = async () => {
      if (!user || !ownerUid || !roundId || !competitionId) {
        setLoading(false);
        return;
      }
      try {
        const matchDocRef = doc(
          db,
          matchDocPath || `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`
        );
        const matchDoc = await getDoc(matchDocRef);
        if (matchDoc.exists()) {
          const data = matchDoc.data();
          const loadedEvents = data.events || [];
          let loadedStats = data.playerStats || [];
          const duration = data.matchDuration || match.matchDuration || 90;
          // Heal stale minutesPlayed: only for players whose expected value is
          // derivable from substitution events (non-event players untouched).
          if (loadedEvents.some((ev: any) => ev?.type === 'substitution')) {
            const teamIds = new Set<string>(loadedStats.map((ps: any) => ps?.teamId).filter(Boolean));
            teamIds.forEach((tid) => {
              loadedStats = healStaleTeamMinutes(loadedStats, loadedEvents, tid, duration);
            });
          }
          const healed = loadedStats.some((ps: any, i: number) => ps !== (data.playerStats || [])[i]);
          methods.reset({
            customStatHeaders: data.customStatHeaders || [],
            playerStats: loadedStats,
            events: loadedEvents,
            homeFormation: data.homeFormation || match.homeFormation || '4-3-3',
            awayFormation: data.awayFormation || match.awayFormation || '4-3-3',
          });
          prevEventCountRef.current = loadedEvents.length;
          loadedSnapshotRef.current = {
            events: loadedEvents,
            playerStats: loadedStats,
            homeFormation: data.homeFormation || match.homeFormation || '4-3-3',
            awayFormation: data.awayFormation || match.awayFormation || '4-3-3',
            customStatHeaders: data.customStatHeaders || [],
          };
          if (healed) {
            await saveSquadData(methods.getValues(), { showToast: false });
          }
        } else {
          methods.reset({
            customStatHeaders: [],
            playerStats: [],
            events: [],
            homeFormation: match.homeFormation || '4-3-3',
            awayFormation: match.awayFormation || '4-3-3',
          });
          prevEventCountRef.current = 0;
          loadedSnapshotRef.current = {
            events: [],
            playerStats: [],
            homeFormation: match.homeFormation || '4-3-3',
            awayFormation: match.awayFormation || '4-3-3',
            customStatHeaders: [],
          };
        }
      } catch (error) {
        console.error("Error fetching match data:", error);
        toast.error("選手データの読み込みに失敗しました。");
      } finally {
        setLoading(false);
        autosaveReadyRef.current = true;
      }
    };
    fetchMatchData();
  }, [match.id, roundId, competitionId, user, ownerUid, methods, matchDocPath]);

  const applyDefaultSquad = async () => {
    const homeDefault = loadDefaultSquad(homePlayers, match.homeTeam);
    const awayDefault = loadDefaultSquad(awayPlayers, match.awayTeam);
    const nextPlayerStats = [...homeDefault.playerStats, ...awayDefault.playerStats];

    if (nextPlayerStats.length === 0) {
      toast.error('登録済みのラインナップがありません。');
      return;
    }

    const current = methods.getValues();
    const nextValues = {
      customStatHeaders: current.customStatHeaders || [],
      playerStats: nextPlayerStats,
      events: current.events || [],
      homeFormation: homeDefault.formation || current.homeFormation || match.homeFormation || '4-3-3',
      awayFormation: awayDefault.formation || current.awayFormation || match.awayFormation || '4-3-3',
    };

    methods.reset(nextValues);
    const res = await saveSquadData(nextValues, { showToast: false });
    if (res.ok) {
      methods.reset(nextValues, { keepValues: true });
      toast.success('登録済みのラインナップを反映して保存しました。');
    } else {
      toast.error('ラインナップの保存に失敗しました。');
    }
  };

  const saveSquadData = async (data: FormValues, opts?: { showToast?: boolean }) => {
    const showToast = opts?.showToast !== false;
    if (!user || !ownerUid || !roundId || !competitionId) {
      if (showToast) toast.error('データが不完全なため保存できません。');
      return { ok: false as const };
    }
    if (savingRef.current) return { ok: false as const };
    savingRef.current = true;
    if (showToast) setSaving(true);
    try {
      const matchDocRef = doc(
        db,
        matchDocPath || `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`
      );

      const playerNameToId = new Map<string, string>();
      [...homePlayers, ...awayPlayers].forEach((p) => {
        if (p?.name && p?.id) playerNameToId.set(p.name, p.id);
      });
      const resolveOriginalFromName = (name?: string): string | undefined => {
        if (!name || !name.startsWith('PK(') || !name.endsWith(')')) return undefined;
        return playerNameToId.get(name.slice(3, -1).trim());
      };

      const goalCounts = new Map<string, number>();
      const assistCounts = new Map<string, number>();
      const yellowCounts = new Map<string, number>();
      const redCounts = new Map<string, number>();

      (data.events || []).forEach((ev: any) => {
        const type = typeof ev?.type === 'string' ? ev.type : '';

        if (type === 'goal') {
          const scorerId = ev.originalPlayerId || resolveOriginalFromName(ev.playerName) || ev.playerId;
          if (scorerId) {
            goalCounts.set(scorerId, (goalCounts.get(scorerId) || 0) + 1);
          }
          if (ev.assistPlayerId) {
            assistCounts.set(ev.assistPlayerId, (assistCounts.get(ev.assistPlayerId) || 0) + 1);
          }
          return;
        }

        if ((type === 'card' || type === 'yellow' || type === 'red') && ev.playerId) {
          const color = type === 'card' ? ev.cardColor : type;
          if (color === 'yellow') {
            yellowCounts.set(ev.playerId, (yellowCounts.get(ev.playerId) || 0) + 1);
          }
          if (color === 'red') {
            redCounts.set(ev.playerId, (redCounts.get(ev.playerId) || 0) + 1);
          }
        }
      });

      const playerNameMap = new Map<string, string>();
      [...homePlayers, ...awayPlayers].forEach((p) => {
        if (p.id && p.name) {
          playerNameMap.set(p.id, p.name);
        }
      });

      const normalizedPlayerStats = sortLineupRows(
        (data.playerStats || [])
          .filter((ps: any) => Boolean(ps?.playerId))
          .map((ps: any) => {
            const playerId = ps.playerId;
            const role = ps?.role ? ps.role : 'starter';
            return {
              ...ps,
              role,
              goals: goalCounts.get(playerId) ?? 0,
              assists: assistCounts.get(playerId) ?? 0,
              yellowCards: yellowCounts.get(playerId) ?? 0,
              redCards: redCounts.get(playerId) ?? 0,
            };
          })
      );

      const sanitizedEvents = (data.events || []).map((ev: any) => {
        const {
          id,
          minute,
          teamId,
          type,
          playerId,
          playerName,
          assistPlayerId,
          assistPlayerName,
          cardColor,
          inPlayerId,
          inPlayerName,
          outPlayerId,
          outPlayerName,
          text,
          originalPlayerId,
          goalKind,
          playerLinkStatus,
          source,
          assistStatus,
          needsConfirmation,
          minuteText,
        } = ev;

        const base: any = { id, minute, teamId, type };
        
        const resolveEventPlayerName = (id: string | undefined, fallbackName: string | undefined) => {
          if (!id) return undefined;
          if (id.startsWith('custom_')) return fallbackName;
          return playerNameMap.get(id) || fallbackName;
        };

        if (playerId) {
          base.playerId = playerId;
          const name = resolveEventPlayerName(playerId, playerName);
          if (name) base.playerName = name;
        } else if (playerName) {
          // 名前のみイベント（未紐づけ）は読み取り名を保持する
          base.playerName = playerName;
        }
        if (assistPlayerId) {
          base.assistPlayerId = assistPlayerId;
          const assistName = resolveEventPlayerName(assistPlayerId, assistPlayerName);
          if (assistName) base.assistPlayerName = assistName;
        } else if (assistPlayerName) {
          base.assistPlayerName = assistPlayerName;
        }
        if (cardColor) base.cardColor = cardColor;
        if (inPlayerId) {
          base.inPlayerId = inPlayerId;
          const inName = resolveEventPlayerName(inPlayerId, inPlayerName);
          if (inName) base.inPlayerName = inName;
        } else if (inPlayerName) {
          base.inPlayerName = inPlayerName;
        }
        if (outPlayerId) {
          base.outPlayerId = outPlayerId;
          const outName = resolveEventPlayerName(outPlayerId, outPlayerName);
          if (outName) base.outPlayerName = outName;
        } else if (outPlayerName) {
          base.outPlayerName = outPlayerName;
        }
        if (text) base.text = text;
        const resolvedOriginal = originalPlayerId || resolveOriginalFromName(playerName);
        if (resolvedOriginal) base.originalPlayerId = resolvedOriginal;
        // OCR拡張フィールドは通常保存・フォーム検証で消えないよう保持する
        if (goalKind) base.goalKind = goalKind;
        if (playerLinkStatus) base.playerLinkStatus = playerLinkStatus;
        if (source) base.source = source;
        if (assistStatus) base.assistStatus = assistStatus;
        if (needsConfirmation !== undefined) base.needsConfirmation = needsConfirmation;
        if (minuteText) base.minuteText = minuteText;
        return base;
      });

      // 競合安全な保存: トランザクション内で最新ドキュメントと3方向マージ。
      // - フォームの編集・削除はそのまま反映
      // - 外部（OCR確定・別タブ）の追加・編集・削除を保持（無言上書きしない）
      // - 双方変更の競合は通知する
      // - 導出スタッツ・出場時間・カード集計・ミラー整合は commitSquadSave 内で完結
      const result = await commitSquadSave(db, matchDocRef.path, {
        form: {
          events: sanitizedEvents,
          playerStats: normalizedPlayerStats,
          homeFormation: data.homeFormation,
          awayFormation: data.awayFormation,
          customStatHeaders: data.customStatHeaders,
        },
        loaded: loadedSnapshotRef.current || {
          events: [],
          playerStats: [],
          customStatHeaders: [],
        },
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        fallbackDuration: match.matchDuration,
        playerNameToId,
      });

      // スナップショットを保存後の状態に更新（次回保存の基準）
      loadedSnapshotRef.current = {
        events: result.events,
        playerStats: result.playerStats,
        homeFormation: result.homeFormation,
        awayFormation: result.awayFormation,
        customStatHeaders: result.customStatHeaders,
      };

      // 外部変更を取り込んだ場合はフォーム表示も同期（古い値の再保存を防ぐ）
      if (result.adoptedExternal) {
        methods.setValue('events', result.events, { shouldDirty: false });
        methods.setValue('playerStats', result.playerStats, { shouldDirty: false });
        if (result.homeFormation !== undefined) {
          methods.setValue('homeFormation', result.homeFormation, { shouldDirty: false });
        }
        if (result.awayFormation !== undefined) {
          methods.setValue('awayFormation', result.awayFormation, { shouldDirty: false });
        }
        methods.setValue('customStatHeaders', result.customStatHeaders, { shouldDirty: false });
      }
      if (result.conflicts.length > 0) {
        toast.warning(`保存しましたが、他の画面との競合がありました: ${result.conflicts.join(' / ')}`);
      }

      if (showToast) toast.success('出場選手・スタッツ・イベントを更新しました。');

      setSavedIndicatorVisible(true);
      if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
      savedIndicatorTimerRef.current = setTimeout(() => {
        setSavedIndicatorVisible(false);
      }, 2000);

      return { ok: true as const };
    } catch (error) {
      console.error("Error saving squad data:", error);
      const code = typeof (error as any)?.code === 'string' ? (error as any)?.code : '';
      if (showToast) toast.error(`更新に失敗しました。${code ? ` (${code})` : ''}`);
      return { ok: false as const };
    } finally {
      savingRef.current = false;
      if (showToast) setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
        savedIndicatorTimerRef.current = null;
      }
    };
  }, []);

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    await saveSquadData(data, { showToast: true });
  };

  const saveFormationChange = async () => {
    const current = methods.getValues();
    const res = await saveSquadData(current, { showToast: false });
    if (!res.ok) {
      setTimeout(async () => {
        const latest = methods.getValues();
        await saveSquadData(latest, { showToast: false });
      }, 600);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!autosaveReadyRef.current) return;
    const eventCount = (watchedEvents || []).length;
    const eventCountChanged = prevEventCountRef.current !== eventCount;
    if (!eventCountChanged && !methods.formState.isDirty) return;
    if (savingRef.current) return;

    const parsed = formSchema.safeParse(methods.getValues());
    if (!parsed.success) {
      console.error('[SquadRegistrationForm] autosave validation failed:', parsed.error);
      return;
    }
    prevEventCountRef.current = eventCount;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(async () => {
      if (!autosaveReadyRef.current) return;
      if (!methods.formState.isDirty) return;
      if (savingRef.current) return;
      const latest = formSchema.safeParse(methods.getValues());
      if (!latest.success) return;
      const res = await saveSquadData(latest.data, { showToast: false });
      if (res.ok) {
        const cur = methods.getValues();
        methods.reset(cur, { keepValues: true });
      }
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedEvents, watchedPlayerStats, watchedCustomStatHeaders, methods.formState.isDirty, loading]);

  // 現在のメンバーをデフォルトとして設定
  const setAsDefaultSquad = () => {
    const currentStats = methods.getValues('playerStats') || [];
    const watchedStats = watchedPlayerStats;
    const statsToUse = currentStats.length > 0 ? currentStats : watchedStats;
    
    if (statsToUse.length === 0) {
      toast.error('メンバーが選択されていません');
      return;
    }
    
    setSettingDefault(true);
    
    const starterCount = statsToUse.filter(ps => ps.role === 'starter').length;
    const subCount = statsToUse.filter(ps => ps.role === 'sub').length;
    
    saveDefaultSquad(statsToUse, {
      [match.homeTeam]: methods.getValues('homeFormation') || match.homeFormation || '4-3-3',
      [match.awayTeam]: methods.getValues('awayFormation') || match.awayFormation || '4-3-3',
    });
    toast.success(`メンバーをデフォルトとして設定しました（スタメン: ${starterCount}名, サブ: ${subCount}名）`);
    
    setSettingDefault(false);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <FormProvider {...methods}>
      <Card className={view === 'events' ? "border-0 bg-transparent text-slate-100 shadow-none" : ""}>
        {view === 'events' ? null : (
          <CardHeader>
            <CardTitle>
              {view === 'player' ? '出場選手登録 & スタッツ' : '出場選手登録 & スタッツ'}
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className={view === 'events' ? "p-0" : ""}>
          <form
            onSubmit={methods.handleSubmit(onSubmit, (errors) => {
              console.error('SquadRegistrationForm: validation errors', errors);
              toast.error('入力内容にエラーがあります。未入力・数値範囲などを確認してください。');
            })}
          >
            {(view === 'player' || view === 'both') ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="home">{match.homeTeamName}</TabsTrigger>
                  <TabsTrigger value="away">{match.awayTeamName}</TabsTrigger>
                </TabsList>
                <TabsContent value="home" forceMount className="data-[state=inactive]:hidden">
                  {homePlayers.length === 0 && awayPlayers.length > 0 && (
                    <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-xs text-blue-800">相手チームの情報は入力しなくても問題ありません</p>
                    </div>
                  )}
                  <div className="mb-4">
                    <Button
                      type="button"
                      onClick={() => {
                        void applyDefaultSquad();
                      }}
                      className="w-full bg-orange-500 text-white hover:bg-orange-600"
                    >
                      登録済みのラインナップを反映する
                    </Button>
                  </div>
                  <PlayerStatsTable 
                    teamId={match.homeTeam} 
                    allPlayers={homePlayers} 
                    matchDuration={match.matchDuration}
                    isHomeTeam={true}
                    onFormationChange={async (formation) => {
                      methods.setValue('homeFormation', formation, { shouldDirty: true });
                      setTimeout(() => {
                        void saveFormationChange();
                      }, 100);
                    }}
                  />
                </TabsContent>
                <TabsContent value="away" forceMount className="data-[state=inactive]:hidden">
                  {awayPlayers.length === 0 && homePlayers.length > 0 && (
                    <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-xs text-blue-800">相手チームの情報は入力しなくても問題ありません</p>
                    </div>
                  )}
                  <div className="mb-4">
                    <Button
                      type="button"
                      onClick={() => {
                        void applyDefaultSquad();
                      }}
                      className="w-full bg-orange-500 text-white hover:bg-orange-600"
                    >
                      登録済みのラインナップを反映する
                    </Button>
                  </div>
                  <PlayerStatsTable 
                    teamId={match.awayTeam} 
                    allPlayers={awayPlayers} 
                    matchDuration={match.matchDuration}
                    isHomeTeam={false}
                    onFormationChange={async (formation) => {
                      methods.setValue('awayFormation', formation, { shouldDirty: true });
                      setTimeout(() => {
                        void saveFormationChange();
                      }, 100);
                    }}
                  />
                </TabsContent>
              </Tabs>
            ) : null}

            {(view === 'events' || view === 'both') ? (
              <div className={view === 'both' ? "mt-10" : "mt-0"}>
                <MatchEventsTable
                  match={match}
                  homePlayers={homePlayers}
                  awayPlayers={awayPlayers}
                />
              </div>
            ) : null}
            {(view === 'player' || view === 'both') ? (
            <div className="mt-8 flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAsDefaultSquad();
                }}
                disabled={settingDefault}
                className="bg-orange-500 text-white hover:bg-orange-600 border-orange-500"
              >
                {settingDefault ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                ラインナップを登録
              </Button>
              <p className="text-xs text-gray-500">今後「登録済みのラインナップを反映する」から登録したメンバーをまとめて反映できます</p>
            </div>
          ) : null}
          </form>
        </CardContent>
      </Card>
    </FormProvider>
  );
}
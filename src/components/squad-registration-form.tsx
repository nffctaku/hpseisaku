"use client";

import { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { Player, MatchDetails } from '@/types/match';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { PlayerStatsTable } from './player-stats-table';
import { MatchEventsTable } from './match-events-table';
import type { SubmitHandler } from 'react-hook-form';

const formSchema = z.object({
  customStatHeaders: z.array(z.object({ id: z.string(), name: z.string().min(1, '必須') })).max(15, '最大15項目です。'),
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
        minute: z.coerce.number().min(0).max(145),
        teamId: z.string(),
        type: z.enum(['goal', 'og', 'card', 'substitution', 'note']),
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
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const ownerUid = ownerUidFromContext || user?.uid;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [savedIndicatorVisible, setSavedIndicatorVisible] = useState(false);

   const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const autosaveReadyRef = useRef(false);
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
  const loadDefaultSquad = (teamPlayers: Player[], fallbackTeamId?: string) => {
    try {
      const saved = localStorage.getItem(seasonStorageKey) ?? localStorage.getItem(legacyStorageKey);
      if (saved) {
        const data = JSON.parse(saved);
        // チームIDを特定（引数のfallbackTeamIdを優先。無ければ最初の選手のteamId）
        let teamId = fallbackTeamId || teamPlayers[0]?.teamId;
        if (!teamId) return [];
        
        const teamDefaultSquad = data[teamId] || { starters: [], subs: [] };
        
        // デフォルトメンバーを構築
        const defaultPlayerStats: any[] = [];
        
        // スタメン
        teamDefaultSquad.starters.forEach((playerId: string, index: number) => {
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
        teamDefaultSquad.subs.forEach((playerId: string) => {
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
        
        return defaultPlayerStats;
      }
    } catch (error) {
      console.error('Error loading default squad:', error);
    }
    return [];
  };

  // デフォルトスタメン・サブ設定を保存
  const saveDefaultSquad = (playerStats: any[]) => {
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
    },
  });

  const watchedEvents = useWatch({ control: methods.control, name: 'events' });
  const watchedPlayerStats = useWatch({ control: methods.control, name: 'playerStats' });
  const watchedCustomStatHeaders = useWatch({ control: methods.control, name: 'customStatHeaders' });

  useEffect(() => {
    const events = Array.isArray(watchedEvents) ? watchedEvents : [];
    const playerStats = Array.isArray(watchedPlayerStats) ? watchedPlayerStats : [];
    if (playerStats.length === 0) return;

    const goalCounts = new Map<string, number>();
    const assistCounts = new Map<string, number>();
    const yellowCounts = new Map<string, number>();
    const redCounts = new Map<string, number>();

    events.forEach((ev: any) => {
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
  }, [watchedEvents, watchedPlayerStats, methods]);

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
          methods.reset({
            customStatHeaders: data.customStatHeaders || [],
            playerStats: data.playerStats || [],
            events: data.events || [],
          });
        } else {
          methods.reset({
            customStatHeaders: [],
            playerStats: [],
            events: [],
          });
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
    const nextPlayerStats = [...homeDefault, ...awayDefault];

    if (nextPlayerStats.length === 0) {
      toast.error('登録済みのラインナップがありません。');
      return;
    }

    const current = methods.getValues();
    const nextValues = {
      customStatHeaders: current.customStatHeaders || [],
      playerStats: nextPlayerStats,
      events: current.events || [],
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

      const goalCounts = new Map<string, number>();
      const assistCounts = new Map<string, number>();
      const yellowCounts = new Map<string, number>();
      const redCounts = new Map<string, number>();

      (data.events || []).forEach((ev: any) => {
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
        } = ev;

        const base: any = { id, minute, teamId, type };
        
        // Always preserve custom player names if they exist
        if (playerId) {
          base.playerId = playerId;
          if (playerName) {
            base.playerName = playerName;
          } else {
            const name = playerNameMap.get(playerId);
            if (name) base.playerName = name;
          }
        }
        if (assistPlayerId) {
          base.assistPlayerId = assistPlayerId;
          if (assistPlayerName) {
            base.assistPlayerName = assistPlayerName;
          } else {
            const aName = playerNameMap.get(assistPlayerId);
            if (aName) base.assistPlayerName = aName;
          }
        }
        if (cardColor) base.cardColor = cardColor;
        if (inPlayerId) {
          base.inPlayerId = inPlayerId;
          if (inPlayerName) base.inPlayerName = inPlayerName;
        }
        if (outPlayerId) {
          base.outPlayerId = outPlayerId;
          if (outPlayerName) base.outPlayerName = outPlayerName;
        }
        if (text) base.text = text;
        return base;
      });

      const payload = stripUndefinedDeep({
        customStatHeaders: data.customStatHeaders,
        playerStats: normalizedPlayerStats,
        events: sanitizedEvents,
      });

      // Check if any event exceeds 90 minutes and automatically set matchDuration to 120
      const hasEventBeyond90 = (data.events || []).some((ev: any) => {
        const minute = ev.minute;
        let baseMinute = 0;
        
        if (typeof minute === 'number') {
          // Handle decimal representation (e.g., 45.001 for "45+1")
          baseMinute = Math.floor(minute);
        } else {
          // Handle string representation (e.g., "45+1" or "95")
          const minuteStr = String(minute);
          if (minuteStr.includes('+')) {
            const parts = minuteStr.split('+');
            baseMinute = parseInt(parts[0], 10) || 0;
          } else {
            baseMinute = parseInt(minuteStr, 10) || 0;
          }
        }
        
        return baseMinute > 90;
      });

      if (hasEventBeyond90) {
        (payload as any).matchDuration = 120;
      } else {
        // If no events beyond 90, keep current matchDuration or default to 90
        (payload as any).matchDuration = match.matchDuration || 90;
      }

      // Count yellow and red cards from events and update team stats
      const homeYellowCards = (data.events || []).filter((ev: any) => 
        ev.type === 'card' && ev.teamId === match.homeTeam && ev.cardColor === 'yellow'
      ).length;
      const awayYellowCards = (data.events || []).filter((ev: any) => 
        ev.type === 'card' && ev.teamId === match.awayTeam && ev.cardColor === 'yellow'
      ).length;
      const homeRedCards = (data.events || []).filter((ev: any) => 
        ev.type === 'card' && ev.teamId === match.homeTeam && ev.cardColor === 'red'
      ).length;
      const awayRedCards = (data.events || []).filter((ev: any) => 
        ev.type === 'card' && ev.teamId === match.awayTeam && ev.cardColor === 'red'
      ).length;

      // Update team stats with card counts
      const existingTeamStats = match.teamStats || [];
      const updatedTeamStats = existingTeamStats.map((stat: any) => {
        if (stat.id === 'yellowCards' || stat.name === 'イエロー') {
          return {
            ...stat,
            homeValue: homeYellowCards,
            awayValue: awayYellowCards,
          };
        }
        if (stat.id === 'redCards' || stat.name === 'レッド') {
          return {
            ...stat,
            homeValue: homeRedCards,
            awayValue: awayRedCards,
          };
        }
        return stat;
      });

      (payload as any).teamStats = updatedTeamStats;

      await setDoc(matchDocRef, payload, { merge: true });

      const eventsColRef = collection(
        db,
        `${(matchDocPath || `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`)}/events`
      );

      const desiredSubDocIds = new Set<string>();
      const batch = writeBatch(db);

      (data.events || [])
        .filter((ev) => ev.type === 'substitution')
        .forEach((ev) => {
          const base = {
            minute: ev.minute,
            teamId: ev.teamId,
            timestamp: serverTimestamp(),
          } as any;

          if (ev.outPlayerId) {
            const outDocId = `sub-${ev.id}-out`;
            desiredSubDocIds.add(outDocId);
            const outPlayerName = ev.outPlayerName || playerNameMap.get(ev.outPlayerId) || '';
            batch.set(
              doc(eventsColRef, outDocId),
              {
                ...base,
                type: 'sub_out',
                playerId: ev.outPlayerId,
                playerName: outPlayerName,
              },
              { merge: true }
            );
          }

          if (ev.inPlayerId) {
            const inDocId = `sub-${ev.id}-in`;
            desiredSubDocIds.add(inDocId);
            const inPlayerName = ev.inPlayerName || playerNameMap.get(ev.inPlayerId) || '';
            batch.set(
              doc(eventsColRef, inDocId),
              {
                ...base,
                type: 'sub_in',
                playerId: ev.inPlayerId,
                playerName: inPlayerName,
              },
              { merge: true }
            );
          }
        });

      const existingEventsSnap = await getDocs(eventsColRef);
      existingEventsSnap.docs.forEach((d) => {
        if (d.id.startsWith('sub-') && !desiredSubDocIds.has(d.id)) {
          batch.delete(d.ref);
        }
      });

      await batch.commit();

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

  useEffect(() => {
    if (loading) return;
    if (!autosaveReadyRef.current) return;
    if (!methods.formState.isDirty) return;
    if (savingRef.current) return;

    const parsed = formSchema.safeParse(methods.getValues());
    if (!parsed.success) return;

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
    
    saveDefaultSquad(statsToUse);
    toast.success(`メンバーをデフォルトとして設定しました（スタメン: ${starterCount}名, サブ: ${subCount}名）`);
    
    setSettingDefault(false);
  };

  // デフォルトスタメン・サブ設定をリセット
  const resetDefaultSquad = () => {
    localStorage.removeItem(seasonStorageKey);
    toast.success('デフォルトスタメン・サブ設定をリセットしました');
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <FormProvider {...methods}>
      <Card className={view === 'events' ? "border-0 shadow-none" : ""}>
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
                <TabsContent value="home">
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
                  <PlayerStatsTable teamId={match.homeTeam} allPlayers={homePlayers} matchDuration={match.matchDuration} />
                </TabsContent>
                <TabsContent value="away">
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
                  <PlayerStatsTable teamId={match.awayTeam} allPlayers={awayPlayers} matchDuration={match.matchDuration} />
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
"use client";

import { useState, useEffect } from 'react';
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
        type: z.enum(['goal', 'card', 'substitution', 'note']),
        playerId: z.string().optional(),
        assistPlayerId: z.string().optional(),
        cardColor: z.enum(['yellow', 'red']).optional(),
        inPlayerId: z.string().optional(),
        outPlayerId: z.string().optional(),
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
  view?: 'player' | 'events' | 'both';
}

export function SquadRegistrationForm({ match, homePlayers, awayPlayers, roundId, competitionId, matchDocPath, view = 'both' }: SquadRegistrationFormProps) {
  console.log('SquadForm: Received homePlayers', homePlayers);
  console.log('SquadForm: Received awayPlayers', awayPlayers);
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const ownerUid = ownerUidFromContext || user?.uid;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [activeTab, setActiveTab] = useState('home');

  // localStorageからデフォルトスタメン・サブ設定を読み込む
  const loadDefaultSquad = (teamPlayers: Player[]) => {
    const storageKey = `default_squad_${ownerUid}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        // チームIDを特定（最初の選手のteamId、またはmatch.homeTeam）
        let teamId = teamPlayers[0]?.teamId;
        if (!teamId) {
          teamId = match.homeTeam;
        }
        
        const teamDefaultSquad = data[teamId] || { starters: [], subs: [] };
        
        // デフォルトメンバーを構築
        const defaultPlayerStats: any[] = [];
        
        // スタメン
        teamDefaultSquad.starters.forEach((playerId: string) => {
          const player = teamPlayers.find(p => p.id === playerId);
          if (player) {
            defaultPlayerStats.push({
              playerId: player.id,
              playerName: player.name,
              position: player.position || 'N/A',
              teamId: teamId,
              role: 'starter',
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
    const storageKey = `default_squad_${ownerUid}`;
    try {
      const existingData = localStorage.getItem(storageKey);
      const data = existingData ? JSON.parse(existingData) : {};
      
      // チームごとにスタメンとサブを分類
      const teamGroups = playerStats.reduce((acc: any, ps: any) => {
        // teamIdがundefinedの場合はmatchのhomeTeamを使用
        let teamId = ps.teamId;
        if (!teamId) {
          teamId = match.homeTeam;
        }
        
        if (!acc[teamId]) {
          acc[teamId] = { starters: [], subs: [] };
        }
        if (ps.role === 'starter') {
          acc[teamId].starters.push(ps.playerId);
        } else {
          acc[teamId].subs.push(ps.playerId);
        }
        return acc;
      }, {});
      
      // データを更新
      Object.keys(teamGroups).forEach(teamId => {
        data[teamId] = teamGroups[teamId];
      });
      
      localStorage.setItem(storageKey, JSON.stringify(data));
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
          let playerStats = data.playerStats || [];
          
          // 既存の選手データがない場合はデフォルト設定を適用
          if (playerStats.length === 0) {
            const homeDefault = loadDefaultSquad(homePlayers);
            const awayDefault = loadDefaultSquad(awayPlayers);
            playerStats = [...homeDefault, ...awayDefault];
          }
          
          methods.reset({
            customStatHeaders: data.customStatHeaders || [],
            playerStats,
            events: data.events || [],
          });
        } else {
          // 試合データが存在しない場合もデフォルト設定を適用
          const homeDefault = loadDefaultSquad(homePlayers);
          const awayDefault = loadDefaultSquad(awayPlayers);
          methods.reset({
            customStatHeaders: [],
            playerStats: [...homeDefault, ...awayDefault],
            events: [],
          });
        }
      } catch (error) {
        console.error("Error fetching match data:", error);
        toast.error("選手データの読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    };
    fetchMatchData();
  }, [match.id, roundId, competitionId, user, ownerUid, methods, matchDocPath]);

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!user || !ownerUid || !roundId || !competitionId) {
      toast.error('データが不完全なため保存できません。');
      return;
    }
    setSaving(true);
    try {
      const matchDocRef = doc(
        db,
        matchDocPath || `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`
      );

      // イベントから G/A/Y/R を集計
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

      // 選手ID → 名前のマップ（得点者表示用にイベントへ埋め込む）
      const playerNameMap = new Map<string, string>();
      [...homePlayers, ...awayPlayers].forEach((p) => {
        if (p.id && p.name) {
          playerNameMap.set(p.id, p.name);
        }
      });

      const normalizedPlayerStats = (data.playerStats || [])
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
      });

      // Firestore は undefined を許可しないため、events から undefined のフィールドを取り除く
      // 併せて playerName / assistPlayerName もイベントに埋め込む
      const sanitizedEvents = (data.events || []).map((ev) => {
        const {
          id,
          minute,
          teamId,
          type,
          playerId,
          assistPlayerId,
          cardColor,
          inPlayerId,
          outPlayerId,
          text,
        } = ev;

        const base: any = { id, minute, teamId, type };
        if (playerId) {
          base.playerId = playerId;
          const name = playerNameMap.get(playerId);
          if (name) base.playerName = name;
        }
        if (assistPlayerId) {
          base.assistPlayerId = assistPlayerId;
          const aName = playerNameMap.get(assistPlayerId);
          if (aName) base.assistPlayerName = aName;
        }
        if (cardColor) base.cardColor = cardColor;
        if (inPlayerId) base.inPlayerId = inPlayerId;
        if (outPlayerId) base.outPlayerId = outPlayerId;
        if (text) base.text = text;
        return base;
      });

      const payload = stripUndefinedDeep({
        customStatHeaders: data.customStatHeaders,
        playerStats: normalizedPlayerStats,
        events: sanitizedEvents,
      });
      await setDoc(matchDocRef, payload, { merge: true });

      // 交代イベントを試合イベント（サブコレクション）へ反映
      // - 既存の手動追加イベント（goal/yellow/red/sub_*等）は保持
      // - このフォーム由来の交代イベントは id が "sub-" で始まるドキュメントとして管理し、現状と差分を取って追加/削除
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
            batch.set(
              doc(eventsColRef, outDocId),
              {
                ...base,
                type: 'sub_out',
                playerId: ev.outPlayerId,
                playerName: playerNameMap.get(ev.outPlayerId) || '',
              },
              { merge: true }
            );
          }

          if (ev.inPlayerId) {
            const inDocId = `sub-${ev.id}-in`;
            desiredSubDocIds.add(inDocId);
            batch.set(
              doc(eventsColRef, inDocId),
              {
                ...base,
                type: 'sub_in',
                playerId: ev.inPlayerId,
                playerName: playerNameMap.get(ev.inPlayerId) || '',
              },
              { merge: true }
            );
          }
        });

      // 既存の sub- 生成イベントのうち、現在のフォームに存在しないものは削除
      const existingEventsSnap = await getDocs(eventsColRef);
      existingEventsSnap.docs.forEach((d) => {
        if (d.id.startsWith('sub-') && !desiredSubDocIds.has(d.id)) {
          batch.delete(d.ref);
        }
      });

      await batch.commit();
      
      // デフォルトスタメン・サブ設定を保存
      saveDefaultSquad((data.playerStats || []).filter((ps: any) => Boolean(ps?.playerId)));
      
      toast.success('出場選手・スタッツ・イベントを更新しました。');
    } catch (error) {
      console.error("Error saving squad data:", error);
      const code = typeof (error as any)?.code === 'string' ? (error as any)?.code : '';
      toast.error(`更新に失敗しました。${code ? ` (${code})` : ''}`);
    } finally {
      setSaving(false);
    }
  };

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
    const storageKey = `default_squad_${ownerUid}`;
    localStorage.removeItem(storageKey);
    toast.success('デフォルトスタメン・サブ設定をリセットしました');
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <FormProvider {...methods}>
      <Card>
        {view === 'events' ? null : (
          <CardHeader>
            <CardTitle>
              {view === 'player' ? '出場選手登録 & スタッツ' : '出場選手登録 & スタッツ'}
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <form onSubmit={methods.handleSubmit(onSubmit)}>
            {(view === 'player' || view === 'both') ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="home">{match.homeTeamName}</TabsTrigger>
                  <TabsTrigger value="away">{match.awayTeamName}</TabsTrigger>
                </TabsList>
                <TabsContent value="home">
                  <PlayerStatsTable teamId={match.homeTeam} allPlayers={homePlayers} />
                </TabsContent>
                <TabsContent value="away">
                  <PlayerStatsTable teamId={match.awayTeam} allPlayers={awayPlayers} />
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
            <div className="mt-8 flex justify-between">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setAsDefaultSquad();
                }}
                disabled={settingDefault}
                className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1 text-sm"
              >
                {settingDefault ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                <div className="flex flex-col items-center">
                  <span className="text-xs">このメンバーを今後</span>
                  <span className="text-xs">デフォルト設定</span>
                </div>
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存
              </Button>
            </div>
          ) : (
            <div className="mt-8 flex justify-end">
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存
              </Button>
            </div>
          )}
          </form>
        </CardContent>
      </Card>
    </FormProvider>
  );
}
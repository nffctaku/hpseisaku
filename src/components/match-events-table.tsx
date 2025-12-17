"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { Player, MatchDetails } from "@/types/match";

// 時間プルダウン用オプション
// 表示順: 0..45, 45+1..45+10, 46..89, 90, 90+1..90+10, 91..145
// ロスタイムは value を小数（例: 45.001）にして重複を避ける
const minuteOptions: { value: number; label: string }[] = [];

// 0-45
for (let m = 0; m <= 45; m++) {
  minuteOptions.push({ value: m, label: m.toString() });
}

// 前半ロスタイム 45+1..45+10 （値は 46-55）
for (let extra = 1; extra <= 10; extra++) {
  const value = 45 + extra / 1000; // 45.001-45.010
  minuteOptions.push({ value, label: `45+${extra}` });
}

// 46-89（通常時間）
for (let m = 46; m <= 89; m++) {
  minuteOptions.push({ value: m, label: m.toString() });
}

// 90（通常時間）
minuteOptions.push({ value: 90, label: "90" });

// 後半ロスタイム 90+1..90+10 （値は 91-100）
for (let extra = 1; extra <= 10; extra++) {
  const value = 90 + extra / 1000; // 90.001-90.010
  minuteOptions.push({ value, label: `90+${extra}` });
}

// 91-145（通常時間）
for (let m = 91; m <= 145; m++) {
  minuteOptions.push({ value: m, label: m.toString() });
}

const formatMinute = (minute: any) => {
  const n = typeof minute === 'number' ? minute : Number(minute);
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return `${n}`;

  const base = Math.floor(n);
  const extra = Math.round((n - base) * 1000);
  if (base === 45 && extra >= 1) return `45+${extra}`;
  if (base === 90 && extra >= 1) return `90+${extra}`;
  return `${n}`;
};

interface MatchEventsTableProps {
  match: MatchDetails;
  homePlayers: Player[];
  awayPlayers: Player[];
}

export function MatchEventsTable({ match, homePlayers, awayPlayers }: MatchEventsTableProps) {
  const { control, watch, setValue, register } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "events",
  });
  const playerStats = watch("playerStats") || [];
  const events = watch("events") || [];

  const playerMap = [...homePlayers, ...awayPlayers].reduce<Record<string, Player>>(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {}
  );

  const handleAddEvent = () => {
    append({
      id: crypto.randomUUID(),
      minute: 0,
      teamId: match.homeTeam,
      type: "goal",
      playerId: undefined,
      assistPlayerId: undefined,
      cardColor: undefined,
      inPlayerId: undefined,
      outPlayerId: undefined,
      text: "",
    } as any);
  };

  const renderEventRow = (field: any, index: number) => {
    const currentType = (watch(`events.${index}.type`) ?? field.type) as
      | "goal"
      | "card"
      | "substitution"
      | "note";
    const teamId = (watch(`events.${index}.teamId`) ?? field.teamId ?? match.homeTeam) as string;

    // この試合でスタメン／ベンチに登録されている選手のみをイベント選択対象にする
    const activePlayerIds: string[] = (playerStats as any[])
      .map((ps) => ps.playerId)
      .filter(Boolean);

    const rawTeamPlayers = teamId === match.homeTeam ? homePlayers : awayPlayers;
    const filteredByActive = rawTeamPlayers.filter((p) => activePlayerIds.includes(p.id));
    const teamPlayers = filteredByActive.length > 0 ? filteredByActive : rawTeamPlayers;

    return (
      <div
        key={field.id}
        className="flex flex-col gap-2 rounded-md border bg-white px-3 py-2 text-xs text-gray-900 md:flex-row md:items-center md:gap-3"
      >
        <div className="grid grid-cols-3 gap-2 md:flex md:items-center md:gap-3 md:w-auto">
          {/* 時間 */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-gray-500">分</span>
            <Select
              value={(watch(`events.${index}.minute`) ?? 0).toString()}
              onValueChange={(val) => setValue(`events.${index}.minute`, parseFloat(val))}
            >
              <SelectTrigger className="h-7 w-full md:w-20 text-xs bg-white text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {minuteOptions.map((opt, idx) => (
                  <SelectItem key={`${opt.value}-${idx}`} value={opt.value.toString()}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* チーム */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-gray-500">チーム</span>
            <Select
              value={teamId}
              onValueChange={(val) => {
                setValue(`events.${index}.teamId`, val);
                // チーム変更時に不整合になりやすい選手選択をクリア
                setValue(`events.${index}.playerId`, undefined);
                setValue(`events.${index}.assistPlayerId`, undefined);
                setValue(`events.${index}.inPlayerId`, undefined);
                setValue(`events.${index}.outPlayerId`, undefined);
              }}
            >
              <SelectTrigger className="h-7 w-full md:w-24 text-xs bg-white text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={match.homeTeam}>{match.homeTeamName}</SelectItem>
                <SelectItem value={match.awayTeam}>{match.awayTeamName}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 種別 */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-gray-500">種別</span>
            <Select value={currentType} onValueChange={(val) => setValue(`events.${index}.type`, val)}>
              <SelectTrigger className="h-7 w-full md:w-24 text-xs bg-white text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="goal">ゴール</SelectItem>
                <SelectItem value="card">カード</SelectItem>
                <SelectItem value="substitution">交代</SelectItem>
                <SelectItem value="note">メモ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 詳細エリア */}
        <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
          {currentType === "goal" && (
            <>
              <Select
                value={watch(`events.${index}.playerId`) ?? "none"}
                onValueChange={(val) =>
                  setValue(
                    `events.${index}.playerId`,
                    val === "none" ? undefined : val
                  )
                }
              >
                <SelectTrigger className="h-7 w-full md:w-36 text-xs bg-white text-gray-900">
                  <SelectValue placeholder="得点者" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {teamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={watch(`events.${index}.assistPlayerId`) ?? "none"}
                onValueChange={(val) =>
                  setValue(
                    `events.${index}.assistPlayerId`,
                    val === "none" ? undefined : val
                  )
                }
              >
                <SelectTrigger className="h-7 w-full md:w-36 text-xs bg-white text-gray-900">
                  <SelectValue placeholder="アシスト(任意)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {teamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {currentType === "card" && (
            <>
              <Select
                value={watch(`events.${index}.playerId`) ?? "none"}
                onValueChange={(val) =>
                  setValue(
                    `events.${index}.playerId`,
                    val === "none" ? undefined : val
                  )
                }
              >
                <SelectTrigger className="h-7 w-full md:w-36 text-xs bg-white text-gray-900">
                  <SelectValue placeholder="選手" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {teamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={field.cardColor ?? "yellow"}
                onValueChange={(val) => setValue(`events.${index}.cardColor`, val)}
              >
                <SelectTrigger className="h-7 w-20 text-xs bg-white text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yellow">イエロー</SelectItem>
                  <SelectItem value="red">レッド</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {currentType === "substitution" && (
            <>
              <Select
                value={watch(`events.${index}.outPlayerId`) ?? "none"}
                onValueChange={(val) =>
                  setValue(
                    `events.${index}.outPlayerId`,
                    val === "none" ? undefined : val
                  )
                }
              >
                <SelectTrigger className="h-7 w-full md:w-36 text-xs bg-white text-gray-900">
                  <SelectValue placeholder="OUT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {teamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={watch(`events.${index}.inPlayerId`) ?? "none"}
                onValueChange={(val) =>
                  setValue(
                    `events.${index}.inPlayerId`,
                    val === "none" ? undefined : val
                  )
                }
              >
                <SelectTrigger className="h-7 w-full md:w-36 text-xs bg-white text-gray-900">
                  <SelectValue placeholder="IN" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {teamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {currentType === "note" && (
            <Input
              className="h-7 text-xs bg-white text-gray-900 w-full"
              placeholder="メモ"
              {...register(`events.${index}.text`)}
            />
          )}
        </div>

        <div className="flex justify-end md:justify-start">
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-200">試合イベント</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-white text-gray-900 border-gray-300 h-8 px-2 text-xs"
          onClick={handleAddEvent}
        >
          <Plus className="h-3 w-3 mr-1" />
          イベント追加
        </Button>
      </div>
      {/* 登録済みイベントの簡易プレビュー */}
      <div className="rounded-md border border-dashed border-gray-600 bg-slate-900/60 px-3 py-2 text-xs text-gray-100">
        {events.length === 0 ? (
          <p className="text-[11px] text-gray-400">まだイベントは登録されていません。</p>
        ) : (
          <div className="space-y-1">
            {[...events]
              .slice()
              .sort((a: any, b: any) => (a.minute ?? 0) - (b.minute ?? 0))
              .map((ev: any) => {
                const teamName =
                  ev.teamId === match.homeTeam ? match.homeTeamName : match.awayTeamName;
                const mainPlayer = ev.playerId ? playerMap[ev.playerId]?.name : undefined;
                const assistPlayer = ev.assistPlayerId
                  ? playerMap[ev.assistPlayerId]?.name
                  : undefined;

                let label = "";
                if (ev.type === "goal") {
                  label = mainPlayer
                    ? `${mainPlayer}${assistPlayer ? `（A: ${assistPlayer}` + "）" : ""}`
                    : "ゴール";
                } else if (ev.type === "card") {
                  const cardLabel = ev.cardColor === "red" ? "レッド" : "イエロー";
                  label = mainPlayer ? `${mainPlayer} ${cardLabel}` : cardLabel;
                } else if (ev.type === "substitution") {
                  const outName = ev.outPlayerId ? playerMap[ev.outPlayerId]?.name : undefined;
                  const inName = ev.inPlayerId ? playerMap[ev.inPlayerId]?.name : undefined;
                  label = `${outName ?? "OUT"} → ${inName ?? "IN"}`;
                } else if (ev.type === "note") {
                  label = ev.text || "メモ";
                }

                return (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between gap-2 border-b border-gray-700/60 pb-0.5 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 min-w-[32px] items-center justify-center rounded-full bg-slate-800 text-[11px] font-medium">
                        {formatMinute(ev.minute)}'
                      </span>
                      <span className="text-[11px] text-gray-300">{teamName}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-end gap-2 text-right">
                      <span className="text-[11px] text-gray-400">
                        {ev.type === "goal"
                          ? "G"
                          : ev.type === "card"
                          ? "C"
                          : ev.type === "substitution"
                          ? "交代"
                          : "メモ"}
                      </span>
                      <span className="text-[11px] truncate max-w-[180px]">{label}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {fields.map((field, index) => renderEventRow(field, index))}
        {fields.length === 0 && (
          <p className="text-xs text-gray-400">まだイベントは登録されていません。</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, ArrowLeftRight, AlertCircle } from "lucide-react";
import { FaFutbol } from "react-icons/fa";
import { Player, MatchDetails } from "@/types/match";
import { formatMinute } from "@/lib/formatMinute";

// 時間プルダウン用オプション
// 表示順: 0..45, 45+1..45+10, 46..89, 90, 90+1..90+10, 91..104, 105+1..105+10, 106..119, 120, 120+1..120+10
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

// 91-104（延長戦前半）
for (let m = 91; m <= 104; m++) {
  minuteOptions.push({ value: m, label: m.toString() });
}

// 延長前半ロスタイム 105+1..105+10 （値は 106-115）
for (let extra = 1; extra <= 10; extra++) {
  const value = 105 + extra / 1000; // 105.001-105.010
  minuteOptions.push({ value, label: `105+${extra}` });
}

// 106-119（延長戦後半）
for (let m = 106; m <= 119; m++) {
  minuteOptions.push({ value: m, label: m.toString() });
}

// 120（延長戦終了）
minuteOptions.push({ value: 120, label: "120" });

// 延長後半ロスタイム 120+1..120+10 （値は 121-130）
for (let extra = 1; extra <= 10; extra++) {
  const value = 120 + extra / 1000; // 120.001-120.010
  minuteOptions.push({ value, label: `120+${extra}` });
}

interface MatchEventsTableProps {
  match: MatchDetails;
  homePlayers: Player[];
  awayPlayers: Player[];
}

export function MatchEventsTable({ match, homePlayers, awayPlayers }: MatchEventsTableProps) {
  const { control, watch, setValue, register } = useFormContext();
  const { fields, prepend, remove } = useFieldArray({
    control,
    name: "events",
  });
  const playerStats = watch("playerStats") || [];
  const events = watch("events") || [];

  const [newEventType, setNewEventType] = useState<"goal" | "og" | "card" | "substitution">("goal");
  const [newEventTeam, setNewEventTeam] = useState(match.homeTeam);
  const [newEventMinute, setNewEventMinute] = useState(0);
  const [newEventPlayerId, setNewEventPlayerId] = useState<string>("");
  const [newEventPlayerName, setNewEventPlayerName] = useState<string>("");
  const [newEventAssistPlayerId, setNewEventAssistPlayerId] = useState<string>("");
  const [newEventAssistPlayerName, setNewEventAssistPlayerName] = useState<string>("");
  const [newEventCardColor, setNewEventCardColor] = useState<"yellow" | "red">("yellow");
  const [newEventOutPlayerId, setNewEventOutPlayerId] = useState<string>("");
  const [newEventOutPlayerName, setNewEventOutPlayerName] = useState<string>("");
  const [newEventInPlayerId, setNewEventInPlayerId] = useState<string>("");
  const [newEventInPlayerName, setNewEventInPlayerName] = useState<string>("");

  const playerMap = [...homePlayers, ...awayPlayers].reduce<Record<string, Player>>(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {}
  );

  const handleAddEvent = () => {
    prepend({
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

  const handleAddNewEvent = () => {
    const newEvent: any = {
      id: crypto.randomUUID(),
      minute: newEventMinute,
      teamId: newEventTeam,
      type: newEventType,
    };

    if (newEventType === "goal") {
      if (newEventPlayerId === "custom") {
        newEvent.playerId = `custom_${Date.now()}`;
        newEvent.playerName = newEventPlayerName.trim();
      } else {
        newEvent.playerId = newEventPlayerId && newEventPlayerId !== "none" ? newEventPlayerId : undefined;
      }
      if (newEventAssistPlayerId === "custom") {
        newEvent.assistPlayerId = `custom_${Date.now()}`;
        newEvent.assistPlayerName = newEventAssistPlayerName.trim();
      } else {
        newEvent.assistPlayerId = newEventAssistPlayerId && newEventAssistPlayerId !== "none" ? newEventAssistPlayerId : undefined;
      }
    } else if (newEventType === "og") {
      if (newEventPlayerId === "custom") {
        newEvent.playerId = `custom_${Date.now()}`;
        newEvent.playerName = newEventPlayerName.trim();
      } else {
        newEvent.playerId = newEventPlayerId && newEventPlayerId !== "none" ? newEventPlayerId : undefined;
      }
    } else if (newEventType === "card") {
      if (newEventPlayerId === "custom") {
        newEvent.playerId = `custom_${Date.now()}`;
        newEvent.playerName = newEventPlayerName.trim();
      } else {
        newEvent.playerId = newEventPlayerId && newEventPlayerId !== "none" ? newEventPlayerId : undefined;
      }
      newEvent.cardColor = newEventCardColor;
    } else if (newEventType === "substitution") {
      if (newEventOutPlayerId === "custom") {
        newEvent.outPlayerId = `custom_${Date.now()}`;
        newEvent.outPlayerName = newEventOutPlayerName.trim();
      } else {
        newEvent.outPlayerId = newEventOutPlayerId && newEventOutPlayerId !== "none" ? newEventOutPlayerId : undefined;
      }
      if (newEventInPlayerId === "custom") {
        newEvent.inPlayerId = `custom_${Date.now()}`;
        newEvent.inPlayerName = newEventInPlayerName.trim();
      } else {
        newEvent.inPlayerId = newEventInPlayerId && newEventInPlayerId !== "none" ? newEventInPlayerId : undefined;
      }
    }

    prepend(newEvent);

    // Reset form
    setNewEventMinute(0);
    setNewEventPlayerId("");
    setNewEventPlayerName("");
    setNewEventAssistPlayerId("");
    setNewEventAssistPlayerName("");
    setNewEventCardColor("yellow");
    setNewEventOutPlayerId("");
    setNewEventOutPlayerName("");
    setNewEventInPlayerId("");
    setNewEventInPlayerName("");
  };

  const getTeamPlayers = (teamId: string) => {
    const rawTeamPlayers = teamId === match.homeTeam ? homePlayers : awayPlayers;
    const teamPlayerIdSet = new Set(rawTeamPlayers.map((p) => p.id));

    const active = (playerStats as any[])
      .filter((ps) => ps?.playerId && teamPlayerIdSet.has(ps.playerId))
      .map((ps) => ({
        playerId: ps.playerId as string,
        role: (ps.role ?? 'starter') as 'starter' | 'sub',
      }));

    const activePlayerIds = active.map((a) => a.playerId);
    const starterIds = active.filter((a) => a.role === 'starter').map((a) => a.playerId);
    const subIds = active.filter((a) => a.role === 'sub').map((a) => a.playerId);

    const filteredByActive = rawTeamPlayers.filter((p) => activePlayerIds.includes(p.id));
    const teamPlayers = filteredByActive.length > 0 ? filteredByActive : rawTeamPlayers;
    const starterPlayers = rawTeamPlayers.filter((p) => starterIds.includes(p.id));
    const subPlayers = rawTeamPlayers.filter((p) => subIds.includes(p.id));

    return { teamPlayers, starterPlayers, subPlayers };
  };

  const { teamPlayers, starterPlayers, subPlayers } = getTeamPlayers(newEventTeam);

  const eventTypeLabels = {
    goal: "ゴール",
    og: "OG",
    card: "カード",
    substitution: "交代",
  };

  const renderEventRow = (field: any, index: number) => {
    const currentType = (watch(`events.${index}.type`) ?? field.type) as
      | "goal"
      | "og"
      | "card"
      | "substitution"
      | "note";
    const teamId = (watch(`events.${index}.teamId`) ?? field.teamId ?? match.homeTeam) as string;
    const minute = watch(`events.${index}.minute`) ?? field.minute ?? 0;

    // この試合でスタメン／ベンチに登録されている選手のみをイベント選択対象にする
    const rawTeamPlayers = teamId === match.homeTeam ? homePlayers : awayPlayers;
    const teamPlayerIdSet = new Set(rawTeamPlayers.map((p) => p.id));

    const active = (playerStats as any[])
      .filter((ps) => ps?.playerId && teamPlayerIdSet.has(ps.playerId))
      .map((ps) => ({
        playerId: ps.playerId as string,
        role: (ps.role ?? 'starter') as 'starter' | 'sub',
      }));

    const activePlayerIds = active.map((a) => a.playerId);
    const starterIds = active.filter((a) => a.role === 'starter').map((a) => a.playerId);
    const subIds = active.filter((a) => a.role === 'sub').map((a) => a.playerId);

    const filteredByActive = rawTeamPlayers.filter((p) => activePlayerIds.includes(p.id));
    const teamPlayers = filteredByActive.length > 0 ? filteredByActive : rawTeamPlayers;
    const starterPlayers = rawTeamPlayers.filter((p) => starterIds.includes(p.id));
    const subPlayers = rawTeamPlayers.filter((p) => subIds.includes(p.id));

    const outPlayers = starterPlayers.length > 0 ? starterPlayers : teamPlayers;
    const inPlayers = subPlayers.length > 0 ? subPlayers : teamPlayers;

    const getPlayerName = (playerId: string | undefined, playerName?: string) => {
      if (!playerId) return "";
      if (playerName) return playerName;
      const player = [...homePlayers, ...awayPlayers].find(p => p.id === playerId);
      return player?.name || "";
    };

    const getEventIcon = () => {
      if (currentType === "goal" || currentType === "og") {
        return <FaFutbol className="h-5 w-5" />;
      } else if (currentType === "card") {
        const cardColor = field.cardColor ?? "yellow";
        return <AlertCircle className={`h-5 w-5 ${cardColor === "yellow" ? "text-yellow-500" : "text-red-500"}`} />;
      } else if (currentType === "substitution") {
        return <ArrowLeftRight className="h-5 w-5" />;
      }
      return null;
    };

    const getEventDescription = () => {
      if (currentType === "goal") {
        const scorer = getPlayerName(field.playerId, field.playerName);
        const assist = field.assistPlayerId === "pk" ? "PK" : getPlayerName(field.assistPlayerId, field.assistPlayerName);
        let text = scorer || "";
        if (assist) text += ` (${assist})`;
        return text;
      } else if (currentType === "og") {
        const scorer = getPlayerName(field.playerId, field.playerName);
        let text = scorer || "";
        text += " (OG)";
        return text;
      } else if (currentType === "card") {
        const player = getPlayerName(field.playerId, field.playerName);
        const cardColor = field.cardColor === "yellow" ? "イエロー" : "レッド";
        let text = player || "";
        text += ` (${cardColor})`;
        return text;
      } else if (currentType === "substitution") {
        const outPlayer = getPlayerName(field.outPlayerId, field.outPlayerName);
        const inPlayer = getPlayerName(field.inPlayerId, field.inPlayerName);
        let text = outPlayer || "";
        text += " → ";
        text += inPlayer || "";
        return text;
      } else if (currentType === "note") {
        return field.text || "メモ";
      }
      return "";
    };

    return (
      <div
        key={field.id}
        className="flex items-center rounded-md border bg-white px-4 py-3 text-gray-900"
      >
        {/* イベントアイコン */}
        <div className="flex-shrink-0 mr-1">
          {getEventIcon()}
        </div>

        {/* 時間とイベント内容 */}
        <div className="flex items-center flex-1 min-w-0 overflow-hidden text-left">
          <span className="text-sm font-medium text-gray-900 w-12 text-left mr-0">{formatMinute(minute)}</span>
          <span className="text-sm text-gray-900">{getEventDescription()}</span>
        </div>

        {/* チーム表示 */}
        <div className="flex-shrink-0 text-left ml-1">
          <span className="text-xs text-gray-500">
            {teamId === match.homeTeam ? "(H)" : "(A)"}
          </span>
        </div>

        {/* 削除ボタン */}
        <div className="flex-shrink-0 ml-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-3">
      <div className="bg-white rounded-lg p-4 w-full">
        <div className="flex flex-col gap-3 mb-4">
          <h3 className="text-base font-bold text-gray-900">
            新しいイベントを追加
          </h3>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setNewEventTeam(match.homeTeam)}
              className={`flex-1 px-3 py-1 text-xs rounded-md transition-colors ${
                newEventTeam === match.homeTeam
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {match.homeTeamName}(H)
            </button>
            <button
              type="button"
              onClick={() => setNewEventTeam(match.awayTeam)}
              className={`flex-1 px-3 py-1 text-xs rounded-md transition-colors ${
                newEventTeam === match.awayTeam
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {match.awayTeamName}(A)
            </button>
          </div>
        </div>

        {/* イベント種別選択ボタン */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setNewEventType("goal")}
            className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-colors ${
              newEventType === "goal"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <FaFutbol className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setNewEventType("og")}
            className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-colors ${
              newEventType === "og"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <FaFutbol className="h-4 w-4 text-red-500" />
          </button>
          <button
            type="button"
            onClick={() => setNewEventType("substitution")}
            className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-colors ${
              newEventType === "substitution"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNewEventType("card");
              setNewEventCardColor("yellow");
            }}
            className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-colors ${
              newEventType === "card" && newEventCardColor === "yellow"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNewEventType("card");
              setNewEventCardColor("red");
            }}
            className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-colors ${
              newEventType === "card" && newEventCardColor === "red"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <AlertCircle className="h-4 w-4 text-red-500" />
          </button>
        </div>

        {/* 分選択 */}
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1">分</div>
          <Select
            value={newEventMinute.toString()}
            onValueChange={(val) => setNewEventMinute(parseFloat(val))}
          >
            <SelectTrigger className="h-10 w-full bg-white text-gray-900">
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

        {/* 種別に応じた入力フィールド */}
        {(newEventType === "goal" || newEventType === "og") && (
          <div className="space-y-3 mb-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">
                {newEventType === "og" ? "OG選手" : "得点者"}
              </div>
              <Select value={newEventPlayerId} onValueChange={(val) => { setNewEventPlayerId(val); if (val !== "custom") setNewEventPlayerName(""); }}>
                <SelectTrigger className="h-10 w-full bg-white text-gray-900">
                  <SelectValue placeholder="選手を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {teamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">その他(自由入力)</SelectItem>
                </SelectContent>
              </Select>
              {newEventPlayerId === "custom" && (
                <Input
                  value={newEventPlayerName}
                  onChange={(e) => setNewEventPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full bg-white text-gray-900"
                />
              )}
            </div>
            {newEventType === "goal" && (
              <div>
                <div className="text-xs text-gray-500 mb-1">アシスト(任意)</div>
                <Select value={newEventAssistPlayerId} onValueChange={(val) => { setNewEventAssistPlayerId(val); if (val !== "custom") setNewEventAssistPlayerName(""); }}>
                  <SelectTrigger className="h-10 w-full bg-white text-gray-900">
                    <SelectValue placeholder="選手を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pk">PK</SelectItem>
                    <SelectItem value="none">未選択</SelectItem>
                    {teamPlayers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">その他(自由入力)</SelectItem>
                  </SelectContent>
                </Select>
                {newEventAssistPlayerId === "custom" && (
                  <Input
                    value={newEventAssistPlayerName}
                    onChange={(e) => setNewEventAssistPlayerName(e.target.value)}
                    placeholder="選手名を入力"
                    className="mt-2 h-10 w-full bg-white text-gray-900"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {newEventType === "card" && (
          <div className="space-y-3 mb-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">選手</div>
              <Select value={newEventPlayerId} onValueChange={(val) => { setNewEventPlayerId(val); if (val !== "custom") setNewEventPlayerName(""); }}>
                <SelectTrigger className="h-10 w-full bg-white text-gray-900">
                  <SelectValue placeholder="選手を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {teamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">その他(自由入力)</SelectItem>
                </SelectContent>
              </Select>
              {newEventPlayerId === "custom" && (
                <Input
                  value={newEventPlayerName}
                  onChange={(e) => setNewEventPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full bg-white text-gray-900"
                />
              )}
            </div>
          </div>
        )}

        {newEventType === "substitution" && (
          <div className="space-y-3 mb-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">OUT選手を選択</div>
              <Select value={newEventOutPlayerId} onValueChange={(val) => { setNewEventOutPlayerId(val); if (val !== "custom") setNewEventOutPlayerName(""); }}>
                <SelectTrigger className="h-10 w-full bg-white text-gray-900">
                  <SelectValue placeholder="選手を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {starterPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">その他(自由入力)</SelectItem>
                </SelectContent>
              </Select>
              {newEventOutPlayerId === "custom" && (
                <Input
                  value={newEventOutPlayerName}
                  onChange={(e) => setNewEventOutPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full bg-white text-gray-900"
                />
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">IN選手を選択</div>
              <Select value={newEventInPlayerId} onValueChange={(val) => { setNewEventInPlayerId(val); if (val !== "custom") setNewEventInPlayerName(""); }}>
                <SelectTrigger className="h-10 w-full bg-white text-gray-900">
                  <SelectValue placeholder="選手を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {subPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">その他(自由入力)</SelectItem>
                </SelectContent>
              </Select>
              {newEventInPlayerId === "custom" && (
                <Input
                  value={newEventInPlayerName}
                  onChange={(e) => setNewEventInPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full bg-white text-gray-900"
                />
              )}
            </div>
          </div>
        )}

        {/* 追加ボタン */}
        <Button
          type="button"
          onClick={handleAddNewEvent}
          className="w-full bg-blue-600 text-white hover:bg-blue-700 h-10"
        >
          追加
        </Button>
      </div>

      {/* 既存のイベントリスト */}
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">登録済みイベント</h3>
        </div>

        <div className="space-y-2">
          {fields
            .map((field, index) => ({ field, index }))
            .sort((a, b) => {
              const eventA = watch(`events.${a.index}`) as any;
              const eventB = watch(`events.${b.index}`) as any;
              const minuteA = eventA?.minute ?? 0;
              const minuteB = eventB?.minute ?? 0;
              return minuteA - minuteB;
            })
            .map(({ field, index }) => renderEventRow(field, index))}
          {fields.length === 0 && (
            <p className="text-xs text-gray-400">まだイベントは登録されていません。</p>
          )}
        </div>
      </div>
    </div>
  );
}

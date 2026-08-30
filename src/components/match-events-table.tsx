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

  const [newEventType, setNewEventType] = useState<"goal" | "card" | "substitution">("goal");
  const [newEventTeam, setNewEventTeam] = useState(match.homeTeam);
  const [newEventMinute, setNewEventMinute] = useState(0);
  const [newEventPlayerId, setNewEventPlayerId] = useState<string>("");
  const [newEventPlayerName, setNewEventPlayerName] = useState<string>("");
  const [newEventOriginalPlayerId, setNewEventOriginalPlayerId] = useState<string>("");
  const [newEventAssistPlayerId, setNewEventAssistPlayerId] = useState<string>("");
  const [newEventAssistPlayerName, setNewEventAssistPlayerName] = useState<string>("");
  const [newEventCardColor, setNewEventCardColor] = useState<"yellow" | "red">("yellow");
  const [newEventOutPlayerId, setNewEventOutPlayerId] = useState<string>("");
  const [newEventOutPlayerName, setNewEventOutPlayerName] = useState<string>("");
  const [newEventInPlayerId, setNewEventInPlayerId] = useState<string>("");
  const [newEventInPlayerName, setNewEventInPlayerName] = useState<string>("");
  const [mobilePicker, setMobilePicker] = useState<null | {
    title: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onSelect: (value: string) => void;
  }>(null);
  const [pressedPickerValue, setPressedPickerValue] = useState<string | null>(null);

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
      // PK/OG/Custom選択時は自由記述を優先
      const shouldUseManualName = newEventPlayerId === 'pk' || newEventPlayerId === 'og' || newEventPlayerId === 'custom';
      
      if (shouldUseManualName) {
        newEvent.playerId = `custom_${Date.now()}`;
        if (newEventPlayerId === 'pk') {
          newEvent.playerName = `PK(${newEventPlayerName.trim()})`;
          newEvent.originalPlayerId = newEventOriginalPlayerId || undefined;
        } else if (newEventPlayerId === 'og') {
          newEvent.playerName = `OG(${newEventPlayerName.trim()})`;
        } else {
          newEvent.playerName = newEventPlayerName.trim();
        }
      } else {
        newEvent.playerId = newEventPlayerId && newEventPlayerId !== "none" ? newEventPlayerId : undefined;
      }
      if (newEventAssistPlayerId === "custom") {
        newEvent.assistPlayerId = `custom_${Date.now()}`;
        newEvent.assistPlayerName = newEventAssistPlayerName.trim();
      } else {
        newEvent.assistPlayerId = newEventAssistPlayerId && newEventAssistPlayerId !== "none" ? newEventAssistPlayerId : undefined;
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
    setNewEventOriginalPlayerId('');
    setNewEventAssistPlayerId("");
    setNewEventAssistPlayerName("");
    setNewEventCardColor("yellow");
    setNewEventOutPlayerId("");
    setNewEventOutPlayerName("");
    setNewEventInPlayerId("");
    setNewEventInPlayerName("");
  };

  const getTeamPlayers = (teamId: string, eventType: string = "goal") => {
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

  const { teamPlayers, starterPlayers, subPlayers } = getTeamPlayers(newEventTeam, newEventType);

  // 得点者用の選手リスト
  const scorerTeamPlayers = newEventTeam === match.homeTeam ? homePlayers : awayPlayers;

  // アシスト用の選手リスト
  const assistTeamPlayers = newEventTeam === match.homeTeam ? homePlayers : awayPlayers;

  const eventTypeLabels = {
    goal: "ゴール",
    card: "カード",
    substitution: "交代",
  };

  const renderPicker = (
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onSelect: (val: string) => void,
    buttonText: string,
    disabled?: boolean
  ) => (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setMobilePicker({ title: label, value, options, onSelect })}
        className="h-10 w-full border-slate-700 bg-slate-900 text-slate-100 rounded-md px-3 py-2 text-left text-sm sm:hidden"
        disabled={disabled}
      >
        {buttonText}
      </button>
      <select
        value={value}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        className="hidden h-10 w-full border border-slate-700 bg-slate-900 text-slate-100 rounded-md px-3 py-2 text-sm shadow-none focus:ring-0 focus:ring-offset-0 sm:block"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-slate-900 text-slate-100">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const renderEventRow = (field: any, index: number) => {
    const currentType = (watch(`events.${index}.type`) ?? field.type) as
      | "goal"
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
      if (playerId.startsWith("custom_")) return playerName || "";
      const player = [...homePlayers, ...awayPlayers].find(p => p.id === playerId);
      return player?.name || playerName || "";
    };

    const resolveEventName = (id: string | undefined, savedName: string | undefined) => {
      if (!id) return savedName || "";
      if (id.startsWith("custom_")) return savedName || "";
      const player = [...homePlayers, ...awayPlayers].find(p => p.id === id);
      const masterName = player?.name;
      console.log('[MatchEventsTable] resolveEventName:', {
        id,
        savedName,
        masterName,
        found: !!player,
        willReturn: masterName || savedName || ""
      });
      return masterName || savedName || "";
    };

    const getEventIcon = () => {
      if (currentType === "goal") {
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
        const scorer = resolveEventName(field.playerId, field.playerName);
        const assist = resolveEventName(field.assistPlayerId, field.assistPlayerName);
        let text = scorer || "";
        if (assist) text += ` (${assist})`;
        return text;
      } else if (currentType === "card") {
        const player = resolveEventName(field.playerId, field.playerName);
        const cardColor = field.cardColor === "yellow" ? "イエロー" : "レッド";
        let text = player || "";
        text += ` (${cardColor})`;
        return text;
      } else if (currentType === "substitution") {
        const outPlayer = resolveEventName(field.outPlayerId, field.outPlayerName);
        const inPlayer = resolveEventName(field.inPlayerId, field.inPlayerName);
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
        className="flex items-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100"
      >
        {/* イベントアイコン */}
        <div className="flex-shrink-0 mr-1">
          {getEventIcon()}
        </div>

        {/* 時間とイベント内容 */}
        <div className="flex items-center flex-1 min-w-0 overflow-hidden text-left">
          <span className="mr-0 w-12 text-left text-sm font-medium text-slate-100">{formatMinute(minute)}</span>
          <span className="text-sm text-slate-200">{getEventDescription()}</span>
        </div>

        {/* チーム表示 */}
        <div className="flex-shrink-0 text-left ml-1">
          <span className="text-xs text-slate-500">
            {teamId === match.homeTeam ? "(H)" : "(A)"}
          </span>
        </div>

        {/* 削除ボタン */}
        <div className="flex-shrink-0 ml-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
            <Trash2 className="h-4 w-4 text-red-300" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-3">
      {mobilePicker ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 sm:hidden" onClick={() => setMobilePicker(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-[#f4f4f6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-12 items-center justify-between border-b border-slate-300/80 bg-white px-4">
              <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobilePicker(null)}>
                キャンセル
              </button>
              <div className="text-sm font-bold text-slate-500">{mobilePicker.title}</div>
              <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobilePicker(null)}>
                完了
              </button>
            </div>
            <div className="relative h-[56vh] overflow-y-auto px-5 py-[22vh] [scroll-snap-type:y_mandatory]">
              {mobilePicker.options.map((option) => {
                const isPressed = pressedPickerValue === option.value;
                const isSelected = option.value === mobilePicker.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onPointerDown={() => setPressedPickerValue(option.value)}
                    onClick={() => {
                      setPressedPickerValue(option.value);
                      window.setTimeout(() => {
                        mobilePicker.onSelect(option.value);
                        setMobilePicker(null);
                        setPressedPickerValue(null);
                      }, 140);
                    }}
                    className={`block h-14 w-full scroll-mt-[22vh] [scroll-snap-align:center] truncate rounded-xl text-center text-[22px] font-bold leading-[56px] transition-colors ${isPressed ? 'bg-blue-500/25 text-blue-700' : isSelected ? 'bg-blue-500/10 text-blue-600' : 'text-slate-400'}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      <div className="w-full rounded-2xl border border-slate-700/70 bg-slate-950 p-4 text-slate-100">
        <div className="flex flex-col gap-3 mb-4">
          <h3 className="text-base font-bold text-white">
            新しいイベントを追加
          </h3>
          <div className="flex items-center gap-1 rounded-xl bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setNewEventTeam(match.homeTeam)}
              className={`flex-1 px-3 py-1 text-xs rounded-md transition-colors ${
                newEventTeam === match.homeTeam
                  ? "bg-emerald-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {match.homeTeamName}(H)
            </button>
            <button
              type="button"
              onClick={() => setNewEventTeam(match.awayTeam)}
              className={`flex-1 px-3 py-1 text-xs rounded-md transition-colors ${
                newEventTeam === match.awayTeam
                  ? "bg-emerald-500 text-white"
                  : "text-slate-400 hover:text-white"
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
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <FaFutbol className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setNewEventType("substitution")}
            className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-colors ${
              newEventType === "substitution"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
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
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
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
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <AlertCircle className="h-4 w-4 text-red-500" />
          </button>
        </div>

        {/* 分選択 */}
        <div className="mb-4">
          <div className="mb-1 text-xs text-slate-400">選択</div>
          {renderPicker(
            '分を選択',
            newEventMinute.toString(),
            minuteOptions.map((opt) => ({ value: opt.value.toString(), label: opt.label })),
            (val) => setNewEventMinute(parseFloat(val)),
            minuteOptions.find(opt => opt.value === newEventMinute)?.label || '分を選択'
          )}
        </div>

        {/* 種別に応じた入力フィールド */}
        {newEventType === "goal" && (
          <div className="space-y-3 mb-4">
            <div>
              <div className="mb-1 text-xs text-slate-400">得点者</div>
              {renderPicker(
                '得点者を選択',
                newEventPlayerId || 'none',
                [
                  { value: 'pk', label: 'PK(ペナルティキック)' },
                  { value: 'og', label: 'OG(オウンゴール)' },
                  { value: 'none', label: '未選択' },
                  ...scorerTeamPlayers.map((p) => ({ value: p.id, label: p.name })),
                  { value: 'custom', label: 'その他(自由入力)' },
                ],
                (val) => {
                  setNewEventPlayerId(val);
                  if (val !== 'pk') setNewEventOriginalPlayerId('');
                  if (val !== "custom") setNewEventPlayerName("");
                },
                newEventPlayerId === 'pk' ? 'PK(ペナルティキック)' : newEventPlayerId === 'og' ? 'OG(オウンゴール)' : newEventPlayerId === 'custom' ? newEventPlayerName || 'その他(自由入力)' : newEventPlayerId === 'none' || !newEventPlayerId ? '得点者を選択' : scorerTeamPlayers.find(p => p.id === newEventPlayerId)?.name || '得点者を選択'
              )}
              {newEventPlayerId === 'custom' && (
                <Input
                  value={newEventPlayerName}
                  onChange={(e) => setNewEventPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
                />
              )}
              {newEventPlayerId === 'pk' && (
                <div className="mt-2">
                  <div className="mb-1 text-xs text-slate-400">PK得点者</div>
                  {renderPicker(
                    'PK得点者を選択',
                    scorerTeamPlayers.find(p => p.name === newEventPlayerName)?.id || '',
                    [{ value: '', label: 'PK得点者を選択' }, ...scorerTeamPlayers.map((p) => ({ value: p.id, label: p.name }))],
                    (val) => {
                  const p = scorerTeamPlayers.find((pl) => pl.id === val);
                  setNewEventPlayerName(p?.name || '');
                  setNewEventOriginalPlayerId(val);
                },
                    newEventPlayerName || 'PK得点者を選択'
                  )}
                </div>
              )}
              {newEventPlayerId === 'og' && (
                <div className="mt-2">
                  <div className="mb-1 text-xs text-slate-400">OG選手</div>
                  <Input
                    value={newEventPlayerName}
                    onChange={(e) => setNewEventPlayerName(e.target.value)}
                    placeholder="自由入力"
                    className="mt-2 h-10 w-full border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-400">アシスト(任意)</div>
              {renderPicker(
                'アシストを選択',
                newEventAssistPlayerId || 'none',
                [
                  { value: 'none', label: '未選択' },
                  ...assistTeamPlayers.filter(p => p.id !== newEventPlayerId).map((p) => ({ value: p.id, label: p.name })),
                  { value: 'custom', label: 'その他(自由入力)' },
                ],
                (val) => {
                  setNewEventAssistPlayerId(val);
                  if (val !== "custom") setNewEventAssistPlayerName("");
                },
                newEventAssistPlayerId === 'none' || !newEventAssistPlayerId ? 'アシストを選択' : newEventAssistPlayerId === 'custom' ? newEventAssistPlayerName || 'その他(自由入力)' : assistTeamPlayers.find(p => p.id === newEventAssistPlayerId)?.name || 'アシストを選択',
                newEventPlayerId === 'pk' || newEventPlayerId === 'og'
              )}
              {newEventAssistPlayerId === "custom" && (
                <Input
                  value={newEventAssistPlayerName}
                  onChange={(e) => setNewEventAssistPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
                />
              )}
            </div>
          </div>
        )}

        {newEventType === "card" && (
          <div className="space-y-3 mb-4">
            <div>
              <div className="mb-1 text-xs text-slate-400">選手</div>
              {renderPicker(
                '選手を選択',
                newEventPlayerId || 'none',
                [
                  { value: 'none', label: '未選択' },
                  ...teamPlayers.map((p) => ({ value: p.id, label: p.name })),
                  { value: 'custom', label: 'その他(自由入力)' },
                ],
                (val) => {
                  setNewEventPlayerId(val);
                  if (val !== 'pk') setNewEventOriginalPlayerId('');
                  if (val !== "custom") setNewEventPlayerName("");
                },
                newEventPlayerId === 'custom' ? newEventPlayerName || 'その他(自由入力)' : newEventPlayerId === 'none' || !newEventPlayerId ? '選手を選択' : teamPlayers.find(p => p.id === newEventPlayerId)?.name || '選手を選択'
              )}
              {newEventPlayerId === "custom" && (
                <Input
                  value={newEventPlayerName}
                  onChange={(e) => setNewEventPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
                />
              )}
            </div>
          </div>
        )}

        {newEventType === "substitution" && (
          <div className="space-y-3 mb-4">
            <div>
              <div className="mb-1 text-xs text-slate-400">OUT選手を選択</div>
              {renderPicker(
                'OUT選手を選択',
                newEventOutPlayerId || 'none',
                [
                  { value: 'none', label: '未選択' },
                  ...starterPlayers.map((p) => ({ value: p.id, label: p.name })),
                  { value: 'custom', label: 'その他(自由入力)' },
                ],
                (val) => {
                  setNewEventOutPlayerId(val);
                  if (val !== "custom") setNewEventOutPlayerName("");
                },
                newEventOutPlayerId === 'custom' ? newEventOutPlayerName || 'その他(自由入力)' : newEventOutPlayerId === 'none' || !newEventOutPlayerId ? '選手を選択' : starterPlayers.find(p => p.id === newEventOutPlayerId)?.name || '選手を選択'
              )}
              {newEventOutPlayerId === "custom" && (
                <Input
                  value={newEventOutPlayerName}
                  onChange={(e) => setNewEventOutPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
                />
              )}
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-400">IN選手を選択</div>
              {renderPicker(
                'IN選手を選択',
                newEventInPlayerId || 'none',
                [
                  { value: 'none', label: '未選択' },
                  ...subPlayers.map((p) => ({ value: p.id, label: p.name })),
                  { value: 'custom', label: 'その他(自由入力)' },
                ],
                (val) => {
                  setNewEventInPlayerId(val);
                  if (val !== "custom") setNewEventInPlayerName("");
                },
                newEventInPlayerId === 'custom' ? newEventInPlayerName || 'その他(自由入力)' : newEventInPlayerId === 'none' || !newEventInPlayerId ? '選手を選択' : subPlayers.find(p => p.id === newEventInPlayerId)?.name || '選手を選択'
              )}
              {newEventInPlayerId === "custom" && (
                <Input
                  value={newEventInPlayerName}
                  onChange={(e) => setNewEventInPlayerName(e.target.value)}
                  placeholder="選手名を入力"
                  className="mt-2 h-10 w-full border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
                />
              )}
            </div>
          </div>
        )}

        {/* 追加ボタン */}
        <Button
          type="button"
          onClick={handleAddNewEvent}
          className="h-10 w-full bg-emerald-500 font-bold text-white hover:bg-emerald-600"
        >
          追加
        </Button>
      </div>

      {/* 既存のイベントリスト */}
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">登録済みイベント</h3>
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
            <p className="text-xs text-slate-500">まだイベントは登録されていません。</p>
          )}
        </div>
      </div>
    </div>
  );
}

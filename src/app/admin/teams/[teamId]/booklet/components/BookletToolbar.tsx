import React from "react";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
  Printer,
  Share2,
  SlidersHorizontal,
  Users,
} from "lucide-react";

function SelectField({
  icon: Icon,
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative block cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 transition-colors hover:border-gray-300">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-gray-500">{label}</div>
          <select
            value={value}
            onChange={(e) => onChange(String(e.target.value || "").trim())}
            disabled={disabled}
            className="mt-0.5 w-full appearance-none bg-transparent text-sm font-bold text-gray-900 outline-none disabled:opacity-50"
          >
            {children}
          </select>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </div>
    </label>
  );
}

function CardHeading({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="text-xs font-bold text-gray-500 tracking-wide">{children}</span>
    </div>
  );
}

export function BookletToolbar({
  clubName,
  teamName,
  season,
  seasonOptions,
  onSeasonChange,
  loading,
  isPro,
  format,
  onSelectFormat,
  a3IsEditMode,
  onA3EnterEdit,
  onA3ExitEdit,
  onA3Print,
  isEditMode,
  selectedCount,
  onEnterEdit,
  onExitEdit,
  onPrint,
  onOpenShare,
  showDisplaySettings,
  onToggleDisplaySettings,
  showParameterGraph,
  onToggleParameterGraph,
  bookletMode,
  onSelectBookletMode,
}: {
  clubName: string;
  teamName: string;
  season: string;
  seasonOptions?: string[];
  onSeasonChange?: (season: string) => void;
  loading: boolean;
  isPro: boolean;
  format: "a4" | "a3";
  onSelectFormat: (format: "a4" | "a3") => void;
  a3IsEditMode: boolean;
  onA3EnterEdit: () => void;
  onA3ExitEdit: () => void;
  onA3Print: () => void;
  isEditMode: boolean;
  selectedCount: number;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onPrint: () => void;
  onOpenShare?: () => void;
  showDisplaySettings: boolean;
  onToggleDisplaySettings: () => void;
  showParameterGraph: boolean;
  onToggleParameterGraph: () => void;
  bookletMode: "team" | "individual";
  onSelectBookletMode: (mode: "team" | "individual") => void;
}) {
  return (
    <div className="no-print mx-auto mb-4 w-full max-w-md space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-white">名鑑作成</h1>
          <p className="truncate text-xs text-gray-400">
            印刷レイアウトと選手を設定 — {clubName} / {teamName} / {season}
          </p>
        </div>
      </div>

      {/* チーム名鑑 / 個人名鑑 切替（A4時のみ） */}
      {format === "a4" ? (
        <div className="flex rounded-full bg-gray-700/60 p-1">
          {(
            [
              ["team", "チーム名鑑"],
              ["individual", "個人名鑑"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelectBookletMode(mode)}
              className={`h-10 flex-1 rounded-full text-sm font-bold transition-colors ${
                bookletMode === mode ? "bg-blue-600 text-white" : "text-gray-300 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 基本設定カード */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <CardHeading icon={SlidersHorizontal}>基本設定</CardHeading>
        <div className="space-y-3">
          <SelectField
            icon={Calendar}
            label="シーズン選択"
            value={season}
            disabled={loading || !seasonOptions || seasonOptions.length === 0 || !onSeasonChange}
            onChange={(v) => onSeasonChange?.(v)}
          >
            {seasonOptions && seasonOptions.length > 0 ? (
              seasonOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))
            ) : (
              <option value={season}>{season || "シーズン未選択"}</option>
            )}
          </SelectField>

          <SelectField
            icon={FileText}
            label="用紙サイズ"
            value={format}
            disabled={loading}
            onChange={(v) => onSelectFormat(v as "a4" | "a3")}
          >
            <option value="a4">A4</option>
            <option value="a3">A3{!isPro ? "（Pro）" : ""}</option>
          </SelectField>
        </div>
      </div>

      {/* 選手設定カード */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <CardHeading icon={Users}>{format === "a4" ? "選手設定" : "レイアウト設定"}</CardHeading>
        <div className="space-y-3">
          {format === "a4" ? (
            !isEditMode ? (
              <button
                type="button"
                onClick={onEnterEdit}
                disabled={loading}
                className="flex h-12 w-full items-center gap-3 rounded-xl bg-blue-600 px-4 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <Users className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-left text-sm font-bold">選手を選択</span>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold tabular-nums">
                  {selectedCount}/15
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            ) : (
              <div className="grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onExitEdit}
                  className="h-12 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  disabled={selectedCount !== 15}
                >
                  決定 ({selectedCount}/15)
                </button>
                <button
                  type="button"
                  onClick={onExitEdit}
                  className="h-12 rounded-xl bg-gray-500 px-3 text-sm font-bold text-white transition-colors hover:bg-gray-600"
                >
                  キャンセル
                </button>
              </div>
            )
          ) : !a3IsEditMode ? (
            <button
              type="button"
              onClick={onA3EnterEdit}
              disabled={loading}
              className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Users className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left text-sm font-bold">編集</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          ) : (
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onA3ExitEdit}
                className="h-12 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
              >
                決定
              </button>
              <button
                type="button"
                onClick={onA3ExitEdit}
                className="h-12 rounded-xl bg-gray-500 px-3 text-sm font-bold text-white transition-colors hover:bg-gray-600"
              >
                キャンセル
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleDisplaySettings}
            disabled={loading}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 transition-colors disabled:opacity-50 ${
              showDisplaySettings
                ? "border-blue-300 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <SlidersHorizontal className="h-5 w-5 shrink-0 text-gray-500" />
            <span className="flex-1 text-left text-sm font-bold text-gray-900">表示項目の設定</span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${showDisplaySettings ? "rotate-90" : ""}`}
            />
          </button>

          {showDisplaySettings ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-gray-900">パラメーターグラフ</span>
                <button
                  type="button"
                  onClick={onToggleParameterGraph}
                  className={`h-8 min-w-16 rounded-full px-3 text-xs font-bold text-white ${showParameterGraph ? "bg-emerald-600" : "bg-gray-500"}`}
                  aria-pressed={showParameterGraph}
                >
                  {showParameterGraph ? "ON" : "OFF"}
                </button>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {/* 出力カード */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <CardHeading icon={Printer}>出力</CardHeading>
        <button
          type="button"
          onClick={format === "a4" ? onPrint : onA3Print}
          disabled={loading || isEditMode || a3IsEditMode}
          className="flex w-full items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3.5 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          <Printer className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-left text-base font-bold">印刷</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </button>
        {onOpenShare ? (
          <button
            type="button"
            onClick={onOpenShare}
            disabled={loading}
            className="mt-2 flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3.5 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Share2 className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left text-base font-bold">公開・シェア</span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

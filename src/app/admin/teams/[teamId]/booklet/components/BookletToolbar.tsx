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

      {/* チーム名鑑 / 個人名鑑 切替（A4時のみ） — リニューアル中のため個人名鑑は非表示 */}

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

          {/* 用紙サイズ選択はリニューアル中のため非表示 */}
        </div>
      </div>

      {/* 選手設定カードはリニューアル中のため非表示 */}

      {/* 出力カード */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <CardHeading icon={Printer}>出力</CardHeading>
        {/* 印刷ボタンはリニューアル中のため非表示 */}
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

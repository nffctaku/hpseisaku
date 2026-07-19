import React from "react";

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
  showDisplaySettings,
  onToggleDisplaySettings,
  showParameterGraph,
  onToggleParameterGraph,
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
  showDisplaySettings: boolean;
  onToggleDisplaySettings: () => void;
  showParameterGraph: boolean;
  onToggleParameterGraph: () => void;
}) {
  return (
    <div className="no-print mb-4 w-full space-y-4">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold">選手名鑑</h1>
        <p className="truncate text-sm text-muted-foreground">
          {clubName} / {teamName} / {season}
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <div className="mb-1 text-xs font-semibold text-white">シーズン選択</div>
          <select
            value={season}
            onChange={(e) => onSeasonChange?.(String(e.target.value || "").trim())}
            className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900"
            disabled={loading || !seasonOptions || seasonOptions.length === 0 || !onSeasonChange}
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
          </select>
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-semibold text-white">用紙サイズ</div>
          <select
            value={format}
            onChange={(e) => onSelectFormat(e.target.value as "a4" | "a3")}
            className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900"
            disabled={loading}
          >
            <option value="a4">A4</option>
            <option value="a3">A3{!isPro ? "（Pro）" : ""}</option>
          </select>
        </label>

        {format === "a4" ? (
          !isEditMode ? (
            <button
              type="button"
              onClick={onEnterEdit}
              className="h-11 w-full rounded-md bg-blue-600 px-3 text-sm font-semibold text-white"
              disabled={loading}
            >
              選手を選択 ({selectedCount}/15)
            </button>
          ) : (
            <div className="grid w-full grid-cols-2 overflow-hidden rounded-md border border-gray-300 bg-white">
              <button
                type="button"
                onClick={onExitEdit}
                className="h-11 bg-green-600 px-3 text-sm font-semibold text-white"
                disabled={selectedCount !== 15}
              >
                決定 ({selectedCount}/15)
              </button>
              <button
                type="button"
                onClick={onExitEdit}
                className="h-11 bg-gray-600 px-3 text-sm font-semibold text-white"
              >
                キャンセル
              </button>
            </div>
          )
        ) : !a3IsEditMode ? (
          <button
            type="button"
            onClick={onA3EnterEdit}
            className="h-11 w-full rounded-md bg-blue-600 px-3 text-sm font-semibold text-white"
            disabled={loading}
          >
            編集
          </button>
        ) : (
          <div className="grid w-full grid-cols-2 overflow-hidden rounded-md border border-gray-300 bg-white">
            <button
              type="button"
              onClick={onA3ExitEdit}
              className="h-11 bg-green-600 px-3 text-sm font-semibold text-white"
            >
              決定
            </button>
            <button
              type="button"
              onClick={onA3ExitEdit}
              className="h-11 bg-gray-600 px-3 text-sm font-semibold text-white"
            >
              キャンセル
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleDisplaySettings}
          className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900"
          disabled={loading}
        >
          表示項目の設定
        </button>

        {showDisplaySettings ? (
          <div className="rounded-md border border-gray-300 bg-white p-3 text-gray-900">
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">パラメーターグラフ</span>
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

        <button
          type="button"
          onClick={format === "a4" ? onPrint : onA3Print}
          className="h-11 w-full rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white"
          disabled={loading || isEditMode || a3IsEditMode}
        >
          印刷
        </button>
      </div>
    </div>
  );
}

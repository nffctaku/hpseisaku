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
}) {
  return (
    <div className="no-print mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold truncate">選手名鑑</h1>
        <p className="text-sm text-muted-foreground truncate">
          {clubName} / {teamName} / {season}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {seasonOptions && seasonOptions.length > 0 && onSeasonChange ? (
          <select
            value={season}
            onChange={(e) => onSeasonChange(String(e.target.value || "").trim())}
            className="px-2 py-2 rounded-md bg-white text-gray-900 text-sm border border-gray-300"
            disabled={loading}
          >
            {seasonOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <div className="inline-flex rounded-md border border-gray-300 bg-white p-1">
          <button
            type="button"
            onClick={() => onSelectFormat("a4")}
            className={
              "px-3 py-1.5 rounded text-sm font-semibold " +
              (format === "a4" ? "bg-slate-800 text-white" : "bg-white text-gray-900 hover:bg-gray-100")
            }
            disabled={loading}
          >
            A4
          </button>
          <button
            type="button"
            onClick={() => onSelectFormat("a3")}
            className={
              "px-3 py-1.5 rounded text-sm font-semibold " +
              (format === "a3" ? "bg-slate-800 text-white" : "bg-white text-gray-900 hover:bg-gray-100") +
              (!isPro ? " opacity-50 cursor-not-allowed" : "")
            }
            disabled={loading}
          >
            A3
          </button>
          </div>

        {format === "a4" ? (
          <>
            {!isEditMode ? (
              <button
                type="button"
                onClick={onEnterEdit}
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
                disabled={loading}
              >
                選手を選択 ({selectedCount}/15)
              </button>
            ) : (
              <div className="inline-flex rounded-md overflow-hidden border border-gray-300 bg-white">
                <button
                  type="button"
                  onClick={onExitEdit}
                  className="px-3 py-2 bg-green-600 text-white text-sm font-semibold whitespace-nowrap"
                  disabled={selectedCount !== 15}
                >
                  決定 ({selectedCount}/15)
                </button>
                <button
                  type="button"
                  onClick={onExitEdit}
                  className="px-3 py-2 bg-gray-600 text-white text-sm font-semibold whitespace-nowrap"
                >
                  キャンセル
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onPrint}
              className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold whitespace-nowrap"
              disabled={loading || isEditMode}
            >
              印刷
            </button>
          </>
        ) : (
          <>
            {!a3IsEditMode ? (
              <button
                type="button"
                onClick={onA3EnterEdit}
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
                disabled={loading}
              >
                編集
              </button>
            ) : (
              <div className="inline-flex rounded-md overflow-hidden border border-gray-300 bg-white">
                <button
                  type="button"
                  onClick={onA3ExitEdit}
                  className="px-3 py-2 bg-green-600 text-white text-sm font-semibold whitespace-nowrap"
                >
                  決定
                </button>
                <button
                  type="button"
                  onClick={onA3ExitEdit}
                  className="px-3 py-2 bg-gray-600 text-white text-sm font-semibold whitespace-nowrap"
                >
                  キャンセル
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onA3Print}
              className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold whitespace-nowrap"
              disabled={loading || a3IsEditMode}
            >
              印刷
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

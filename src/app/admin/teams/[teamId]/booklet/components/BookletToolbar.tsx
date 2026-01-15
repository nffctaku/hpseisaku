import React from "react";

export function BookletToolbar({
  clubName,
  teamName,
  season,
  loading,
  isPro,
  isEditMode,
  selectedCount,
  paper,
  onChangePaper,
  onEnterEdit,
  onExitEdit,
  onPrint,
}: {
  clubName: string;
  teamName: string;
  season: string;
  loading: boolean;
  isPro: boolean;
  isEditMode: boolean;
  selectedCount: number;
  paper: "a4" | "a3_landscape";
  onChangePaper: (paper: "a4" | "a3_landscape") => void;
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
      <div className="flex items-center gap-2">
        {isPro ? (
          <select
            value={paper}
            onChange={(e) => onChangePaper((e.target.value as any) || "a4")}
            className="px-2 py-2 rounded-md bg-white text-gray-900 text-sm border border-gray-300"
            disabled={loading || isEditMode}
          >
            <option value="a4">A4</option>
            <option value="a3_landscape">A3(横)</option>
          </select>
        ) : null}
        {!isEditMode && (
          <button
            type="button"
            onClick={onEnterEdit}
            className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold"
            disabled={loading}
          >
            選手を選択 ({selectedCount}/15)
          </button>
        )}
        {isEditMode && (
          <>
            <button
              type="button"
              onClick={onExitEdit}
              className="px-3 py-2 rounded-md bg-green-600 text-white text-sm font-semibold"
              disabled={selectedCount !== 15}
            >
              決定 ({selectedCount}/15)
            </button>
            <button
              type="button"
              onClick={onExitEdit}
              className="px-3 py-2 rounded-md bg-gray-600 text-white text-sm font-semibold"
            >
              キャンセル
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onPrint}
          className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold"
          disabled={loading || isEditMode}
        >
          印刷
        </button>
      </div>
    </div>
  );
}

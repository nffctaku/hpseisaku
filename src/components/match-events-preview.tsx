"use client";

import { MatchDetails, Player } from "@/types/match";

interface MatchEventsPreviewProps {
  match: MatchDetails;
  homePlayers: Player[];
  awayPlayers: Player[];
}

export function MatchEventsPreview({ match, homePlayers, awayPlayers }: MatchEventsPreviewProps) {
  const events: any[] = (match as any).events || [];

  const playerMap = [...homePlayers, ...awayPlayers].reduce<Record<string, Player>>(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {}
  );

  if (!events.length) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-gray-600 bg-slate-900/60 px-4 py-3 text-xs text-gray-100">
        <p className="text-[11px] text-gray-400">まだ試合イベントは登録されていません。</p>
      </div>
    );
  }

  const sorted = [...events]
    .slice()
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  const renderLabel = (ev: any) => {
    const mainPlayer = ev.playerId ? playerMap[ev.playerId]?.name : undefined;
    const assistPlayer = ev.assistPlayerId ? playerMap[ev.assistPlayerId]?.name : undefined;

    if (ev.type === 'goal') {
      return mainPlayer
        ? `${mainPlayer}${assistPlayer ? `（A: ${assistPlayer}` + ') ' : ''}`
        : 'ゴール';
    }
    if (ev.type === 'card') {
      const cardLabel = ev.cardColor === 'red' ? 'レッド' : 'イエロー';
      return mainPlayer ? `${mainPlayer} ${cardLabel}` : cardLabel;
    }
    if (ev.type === 'substitution') {
      const outName = ev.outPlayerId ? playerMap[ev.outPlayerId]?.name : undefined;
      const inName = ev.inPlayerId ? playerMap[ev.inPlayerId]?.name : undefined;
      return `${outName ?? 'OUT'} → ${inName ?? 'IN'}`;
    }
    if (ev.type === 'note') {
      return ev.text || 'メモ';
    }
    return '';
  };

  const renderTypeBadge = (ev: any) => {
    if (ev.type === 'goal') return '⚽';
    if (ev.type === 'card') return ev.cardColor === 'red' ? 'R' : 'Y';
    if (ev.type === 'substitution') return '⇄';
    return '✎';
  };

  // ゴールごとのスコア推移と HT/FT 行を含む行データを組み立てる
  type Row =
    | { kind: 'event'; ev: any; homeScore: number; awayScore: number }
    | { kind: 'ht'; homeScore: number; awayScore: number; id: string }
    | { kind: 'ft'; homeScore: number; awayScore: number; id: string };

  const rows: Row[] = [];
  let homeScore = 0;
  let awayScore = 0;

  sorted.forEach((ev) => {
    if (ev.type === 'goal') {
      if (ev.teamId === match.homeTeam) homeScore += 1;
      else if (ev.teamId === match.awayTeam) awayScore += 1;
    }
    rows.push({ kind: 'event', ev, homeScore, awayScore });
  });

  // HT 行: 前半終了時点（45分以下の最後のイベントの直後）
  const lastFirstHalfIndex = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => r.kind === 'event' && (r.ev.minute ?? 0) <= 45)
    .map(({ idx }) => idx)
    .pop();

  if (lastFirstHalfIndex !== undefined) {
    const ref = rows[lastFirstHalfIndex] as Extract<Row, { kind: 'event' }>;
    rows.splice(lastFirstHalfIndex + 1, 0, {
      kind: 'ht',
      homeScore: ref.homeScore,
      awayScore: ref.awayScore,
      id: 'ht-line',
    });
  }

  // FT 行: 最後のスコア
  const finalScoreRow = rows
    .slice()
    .reverse()
    .find((r) => r.kind === 'event') as Extract<Row, { kind: 'event' }> | undefined;

  if (finalScoreRow) {
    rows.push({
      kind: 'ft',
      homeScore: finalScoreRow.homeScore,
      awayScore: finalScoreRow.awayScore,
      id: 'ft-line',
    });
  }

  return (
    <div className="mt-4 rounded-md border border-gray-700 bg-slate-900/70 px-4 py-3 text-xs text-gray-100 space-y-1">
      {rows.map((row, index) => {
        if (row.kind === 'ht' || row.kind === 'ft') {
          const label = `${row.kind.toUpperCase()} ${row.homeScore}-${row.awayScore}`;
          return (
            <div
              key={row.id}
              className="flex items-center justify-center py-1 text-[11px] text-gray-300"
            >
              <span className="px-3 py-0.5 rounded-full border border-gray-600 bg-slate-900/80">
                {label}
              </span>
            </div>
          );
        }

        const { ev, homeScore: h, awayScore: a } = row;
        const isHome = ev.teamId === match.homeTeam;
        let label = renderLabel(ev);
        if (ev.type === 'goal') {
          label = `${label} (${h}-${a})`;
        }

        return (
          <div
            key={ev.id ?? index}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1"
          >
            {/* Home side */}
            <div className="flex justify-end pr-2">
              {isHome && (
                <div className="text-right max-w-[160px]">
                  <div className="text-[11px] font-medium text-emerald-300 truncate">{label}</div>
                </div>
              )}
            </div>

            {/* Center minute + type */}
            <div className="flex flex-col items-center justify-center min-w-[40px]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold mb-0.5">
                {ev.minute}'
              </span>
              <span className="text-[10px]">{renderTypeBadge(ev)}</span>
            </div>

            {/* Away side */}
            <div className="flex justify-start pl-2">
              {!isHome && (
                <div className="text-left max-w-[160px]">
                  <div className="text-[11px] font-medium text-sky-300 truncate">{label}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

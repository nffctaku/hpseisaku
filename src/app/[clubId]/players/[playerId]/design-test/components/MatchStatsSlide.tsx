import Image from "next/image";

import { getPlayerMatchResults } from "../lib/playerStats";

export async function MatchStatsSlide({
  ownerUid,
  playerId,
  targetSeason,
}: {
  ownerUid: string;
  playerId: string;
  targetSeason?: string | null;
}) {
  const matchRows = targetSeason ? await getPlayerMatchResults(ownerUid, playerId, targetSeason) : [];

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">試合スタッツ</div>
        <div className="text-xs text-white/50">{matchRows.length}試合</div>
      </div>

      <div className="mt-3 divide-y divide-white/10">
        {matchRows.length === 0 ? (
          <div className="py-6 text-sm text-white/70">試合データがありません</div>
        ) : (
          matchRows.slice(0, 20).map((m) => {
            const d = (() => {
              const ms = Date.parse(m.matchDate);
              if (!Number.isFinite(ms)) return m.matchDate;
              return new Date(ms).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });
            })();
            const scoreText = m.scoreHome == null || m.scoreAway == null ? "-" : `${m.scoreHome} - ${m.scoreAway}`;
            const minutesNumText = m.isBench ? "B" : !m.minutesPlayed ? "-" : `${m.minutesPlayed}`;
            const goalsNumText = !m.goals ? "-" : `${m.goals}`;
            const assistsNumText = !m.assists ? "-" : `${m.assists}`;
            const outcomeClass = (() => {
              if (m.scoreHome == null || m.scoreAway == null) return "text-white/70";
              if (m.ha === "(H)") {
                if (m.scoreHome > m.scoreAway) return "text-emerald-400";
                if (m.scoreHome < m.scoreAway) return "text-red-400";
                return "text-white/70";
              }
              if (m.ha === "(A)") {
                if (m.scoreAway > m.scoreHome) return "text-emerald-400";
                if (m.scoreAway < m.scoreHome) return "text-red-400";
                return "text-white/70";
              }
              return "text-white/70";
            })();

            return (
              <div key={`${m.competitionId}/${m.roundId}/${m.matchId}`} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-white/60">{d}</div>
                    <div className="mt-1 flex items-center gap-2 text-sm font-semibold min-w-0">
                      {m.opponentLogoUrl ? (
                        <span className="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-sm">
                          <Image src={m.opponentLogoUrl} alt={m.opponentName} fill sizes="18px" className="object-contain" />
                        </span>
                      ) : (
                        <span className="text-white/70 shrink-0">対</span>
                      )}
                      <span className="truncate">{m.opponentName}</span>
                      <span className="text-white/70 shrink-0">{m.ha}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-white/70">
                      <span className={outcomeClass}>{scoreText}</span>
                      <span className="mx-2 text-white/30">|</span>
                      {m.competitionName}
                    </div>
                  </div>

                  <div className="flex items-end gap-2 shrink-0">
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-[10px] leading-none text-white/50">MIN</div>
                      <div className="h-8 w-12 rounded-full border border-white/10 bg-white/5 text-sm font-semibold tabular-nums inline-flex items-center justify-center">
                        {minutesNumText}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-[10px] leading-none text-white/50">G</div>
                      <div className="h-8 w-10 rounded-full border border-white/10 bg-white/5 text-sm font-semibold tabular-nums inline-flex items-center justify-center">
                        {goalsNumText}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-[10px] leading-none text-white/50">A</div>
                      <div className="h-8 w-10 rounded-full border border-white/10 bg-white/5 text-sm font-semibold tabular-nums inline-flex items-center justify-center">
                        {assistsNumText}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

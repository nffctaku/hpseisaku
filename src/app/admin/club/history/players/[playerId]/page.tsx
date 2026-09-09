"use client";

import { useMemo, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { useParams } from "next/navigation";
import { useAnalysisData } from "@/app/admin/analysis/hooks/use-analysis-data";
import { MatchDetails } from "@/types/match";
import { getFlagUrl } from "@/lib/flag-url";

type PlayerMatchStat = {
  playerId: string;
  playerName?: string;
  number?: number;
  position?: string;
  teamId?: string;
  rating: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  role?: string;
};

type ClubMatch = Omit<MatchDetails, "playerStats"> & {
  playerStats?: PlayerMatchStat[];
  competitionSeason?: string;
  isCompleted?: boolean;
  result?: "win" | "draw" | "loss";
  goalsFor?: number;
  goalsAgainst?: number;
  isHome?: boolean;
};


function getPositionLabel(position?: string) {
  const p = position?.toUpperCase() || "";
  if (p.includes("GK")) return "GK";
  if (p.includes("DF")) return "DF";
  if (p.includes("MF")) return "MF";
  if (p.includes("FW")) return "FW";
  return position || "-";
}

function flagLoader({ src }: { src: string; width: number; quality?: number }): string {
  return src;
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#071321] p-3 text-center">
      <p className="text-[22px] font-black leading-none text-white">{value}</p>
      <p className="mt-1 text-[9px] font-bold text-[#8295AA]">{label}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#071321] p-3 text-center">
      <p className="text-[9px] font-bold text-[#8295AA]">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { playerStatsList, filteredMatches, loading, error } = useAnalysisData();

  const player = useMemo(
    () => playerStatsList.find((p) => p.playerId === playerId),
    [playerStatsList, playerId]
  );

  const matches = useMemo(
    () => (filteredMatches as unknown as ClubMatch[]),
    [filteredMatches]
  );

  const nameParts = useMemo(() => {
    if (!player) return ["", ""];
    const trimmed = player.playerName.trim();
    const idx = trimmed.lastIndexOf(" ");
    if (idx > 0) return [trimmed.slice(0, idx), trimmed.slice(idx + 1)];
    return [trimmed, ""];
  }, [player]);

  const [firstName, lastName] = nameParts;

  const seasonStats = useMemo(() => {
    if (!player) return [];
    const map = new Map<
      string,
      {
        season: string;
        number?: number;
        matches: number;
        goals: number;
        assists: number;
        mom: number;
        cleanSheets: number;
        ratingSum: number;
        ratingCount: number;
      }
    >();

    matches.forEach((match) => {
      const season = match.competitionSeason || "不明";
      const stat = match.playerStats?.find((p) => p.playerId === playerId);
      if (!stat) return;

      const isStarter = stat.role === "starter" || !stat.role;
      const minutes = Number(stat.minutesPlayed) || 0;
      const played = isStarter || minutes > 0;
      if (!played) return;

      if (!map.has(season)) {
        map.set(season, {
          season,
          matches: 0,
          goals: 0,
          assists: 0,
          mom: 0,
          cleanSheets: 0,
          ratingSum: 0,
          ratingCount: 0,
        });
      }
      const s = map.get(season)!;
      s.matches += 1;
      s.number = s.number ?? stat.number ?? player.number;
      s.goals += stat.goals || 0;
      s.assists += stat.assists || 0;

      const playerIsGk = (player.position || "").toUpperCase().includes("GK");
      if (playerIsGk && match.isCompleted && match.goalsAgainst === 0) {
        s.cleanSheets += 1;
      }

      const allStats = match.playerStats || [];
      const ratings = allStats
        .map((p) => Number(p.rating))
        .filter((r) => Number.isFinite(r) && r > 0);
      const maxRating = ratings.length > 0 ? Math.max(...ratings) : 0;
      const myRating = Number.isFinite(stat.rating) ? stat.rating : 0;
      if (myRating > 0 && myRating >= maxRating && maxRating > 0) {
        s.mom += 1;
      }

      const r = Number(stat.rating);
      if (Number.isFinite(r) && r > 0) {
        s.ratingSum += r;
        s.ratingCount += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.season.localeCompare(b.season)
    );
  }, [matches, playerId, player]);

  const totalStats = useMemo(() => {
    return seasonStats.reduce(
      (acc, s) => {
        acc.matches += s.matches;
        acc.goals += s.goals;
        acc.assists += s.assists;
        acc.mom += s.mom;
        acc.cleanSheets += s.cleanSheets;
        acc.ratingSum += s.ratingSum;
        acc.ratingCount += s.ratingCount;
        return acc;
      },
      { matches: 0, goals: 0, assists: 0, mom: 0, cleanSheets: 0, ratingSum: 0, ratingCount: 0 }
    );
  }, [seasonStats]);

  const isGk = (player?.position || "").toUpperCase().includes("GK");

  const ranks = useMemo(() => {
    if (!player) {
      return { matchRank: 0, goalRank: 0, assistRank: 0, csRank: null };
    }
    const byMatches = [...playerStatsList].sort(
      (a, b) => (b.matches || 0) - (a.matches || 0)
    );
    const byGoals = [...playerStatsList].sort(
      (a, b) => (b.goals || 0) - (a.goals || 0)
    );
    const byAssists = [...playerStatsList].sort(
      (a, b) => (b.assists || 0) - (a.assists || 0)
    );
    const byCleanSheets = [...playerStatsList].sort(
      (a, b) => (b.cleanSheets || 0) - (a.cleanSheets || 0)
    );
    return {
      matchRank:
        byMatches.findIndex((p) => p.playerId === player.playerId) + 1,
      goalRank: byGoals.findIndex((p) => p.playerId === player.playerId) + 1,
      assistRank:
        byAssists.findIndex((p) => p.playerId === player.playerId) + 1,
      csRank: isGk
        ? byCleanSheets.findIndex((p) => p.playerId === player.playerId) + 1
        : null,
    };
  }, [player, playerStatsList, isGk]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020A14] text-white">
        <p className="text-sm font-bold">読み込み中...</p>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020A14] px-4 text-white">
        <p className="text-sm font-bold text-red-400">
          {error || "選手が見つかりません"}
        </p>
      </div>
    );
  }

  const endSeasonText =
    player.tenureEnd === "PRESENT"
      ? "現在"
      : player.tenureEnd || player.tenureStart;
  const tenureText = player.tenureStart
    ? `${player.tenureStart} 〜 ${endSeasonText}`
    : "-";
  const flagUrl = player.nationality ? getFlagUrl(player.nationality) : null;

  return (
    <div
      className="min-h-screen bg-[#020A14] pb-24 text-white"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgba(5,20,40,0.5), rgba(2,10,20,0.5) 50%, rgba(0,0,0,0.5)), repeating-linear-gradient(to bottom, transparent, transparent 99px, rgba(255,255,255,0.02) 99px, rgba(255,255,255,0.02) 100px), repeating-linear-gradient(to right, transparent, transparent 159px, rgba(255,255,255,0.015) 159px, rgba(255,255,255,0.015) 160px), repeating-linear-gradient(45deg, transparent, transparent 39px, rgba(255,255,255,0.01) 39px, rgba(255,255,255,0.01) 40px), url('/選手背景.jpg')",
        backgroundSize: "cover, 100% 100px, 160px 100%, 40px 40px, cover",
        backgroundPosition: "center, 0 0, 0 0, 0 0, center",
        backgroundAttachment: "fixed, fixed, fixed, fixed, fixed",
        backgroundRepeat: "no-repeat, repeat, repeat, repeat, no-repeat",
      }}
    >
      <section className="relative h-[360px] overflow-hidden sm:h-[420px]">
        <Image
          src={player.photoUrl || "/選手記録背景.jpg"}
          alt={player.playerName}
          fill
          priority
          className="pointer-events-none object-cover"
          style={{
            objectPosition: "80% 20%",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 15%, black 85%, transparent), linear-gradient(to top, transparent, black 20px, black 100%)",
            WebkitMaskSize: "cover, cover",
            WebkitMaskRepeat: "no-repeat, no-repeat",
            WebkitMaskPosition: "0 0, 0 0",
            WebkitMaskComposite: "source-in",
            maskImage:
              "linear-gradient(to right, transparent, black 15%, black 85%, transparent), linear-gradient(to top, transparent, black 20px, black 100%)",
            maskSize: "cover, cover",
            maskRepeat: "no-repeat, no-repeat",
            maskPosition: "0 0, 0 0",
            maskComposite: "intersect",
          }}
          sizes="100vw"
        />

        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-black/30 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-[25%] bg-gradient-to-r from-[#020A14]/80 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-[25%] bg-gradient-to-l from-[#020A14]/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#020A14] via-[#020A14]/60 to-transparent" />

        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center gap-2">
          <p className="text-7xl font-black tracking-[0.2em] text-white/[0.04] sm:text-8xl">
            LEGACY
          </p>
          <p className="text-2xl font-black tracking-[0.3em] text-white/[0.04] sm:text-3xl">
            HALL OF FAME
          </p>
        </div>

        <div className="pointer-events-auto absolute left-4 top-4 z-50">
          <Link
            href="/admin/club/history/players/rankings"
            aria-label="一覧に戻る"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        <div className="absolute bottom-0 left-0 z-10 w-full p-4 sm:p-6">
          <div className="max-w-[70%]">
            {ranks.goalRank === 1 && (
              <div className="mb-2 inline-flex items-center gap-1 rounded border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[10px] font-black text-yellow-400">
                <span>👑</span>
                <span>ALL-TIME TOP SCORER</span>
              </div>
            )}

            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-slate-300">
              <span>{getPositionLabel(player.position)}</span>
              {flagUrl ? (
                <Image
                  src={flagUrl}
                  alt={player.nationality || ""}
                  width={24}
                  height={16}
                  className="h-4 w-6 object-cover"
                  loader={flagLoader}
                />
              ) : (
                <span>{player.nationality || "-"}</span>
              )}
            </div>

            {firstName && lastName && firstName !== lastName ? (
              <div className="mt-1">
                <p className="text-[30px] leading-[0.9] font-black uppercase tracking-[-0.04em] text-yellow-400">
                  {firstName}
                </p>
                <p className="text-[32px] leading-[0.9] font-black uppercase tracking-[-0.04em] text-yellow-400">
                  {lastName}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-[32px] leading-[0.9] font-black uppercase tracking-[-0.04em] text-yellow-400">
                {player.playerName}
              </p>
            )}

            <p className="mt-1 text-[11px] font-bold text-slate-300">
              {tenureText}
            </p>
          </div>
        </div>
      </section>

      <div className="px-4 pt-5 sm:px-6">
        <p className="text-[10px] font-black text-white">所属記録</p>
        <div className="mt-1 grid grid-cols-4 gap-2">
          <StatCard value={player.matches} label="出場" />
          <StatCard
            value={isGk ? player.cleanSheets : player.goals}
            label={isGk ? "CS" : "得点"}
          />
          <StatCard value={player.assists} label="アシスト" />
          <StatCard value={0} label="タイトル" />
        </div>


        <div className="mt-6">
          <p className="text-[10px] font-black text-white">歴代順位</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <div className="rounded border border-white/10 bg-[#071321] p-2 text-center">
              <p className="text-[9px] font-bold text-[#8295AA]">出場数</p>
              <p className="mt-1 text-base font-black text-white">
                #{ranks.matchRank}
              </p>
            </div>
            <div className="rounded border border-white/10 bg-[#071321] p-2 text-center">
              <p className="text-[9px] font-bold text-[#8295AA]">得点</p>
              <p
                className={`mt-1 text-base font-black ${
                  ranks.goalRank === 1 ? "text-yellow-400" : "text-white"
                }`}
              >
                #{ranks.goalRank}
              </p>
            </div>
            <div className="rounded border border-white/10 bg-[#071321] p-2 text-center">
              <p className="text-[9px] font-bold text-[#8295AA]">アシスト</p>
              <p className="mt-1 text-base font-black text-white">
                #{ranks.assistRank}
              </p>
            </div>
            <div className="rounded border border-white/10 bg-[#071321] p-2 text-center">
              <p className="text-[9px] font-bold text-[#8295AA]">CS（GKのみ）</p>
              <p className="mt-1 text-base font-black text-white">
                {ranks.csRank != null ? `#${ranks.csRank}` : "-"}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[10px] font-black text-white">シーズン記録</p>
        <div className="mt-1 rounded-lg border border-white/10 bg-[#071321] p-3">
          <div className="grid grid-cols-[1.2fr_0.4fr_0.7fr_0.7fr_0.9fr_0.6fr_0.6fr] gap-1 border-b border-white/10 pb-2 text-[9px] font-bold text-[#8295AA]">
            <div>シーズン</div>
            <div className="text-center">#</div>
            <div className="text-center">出場</div>
            <div className="text-center">{isGk ? "CS" : "得点"}</div>
            <div className="text-center">アシスト</div>
            <div className="text-center text-[#8295AA]/40">MOM</div>
            <div className="text-center">評価</div>
          </div>

          {seasonStats.map((s) => (
            <div
              key={s.season}
              className="grid grid-cols-[1.2fr_0.4fr_0.7fr_0.7fr_0.9fr_0.6fr_0.6fr] gap-1 border-b border-white/[0.05] py-2 text-[11px] font-bold text-white"
            >
              <div className="truncate">{s.season}</div>
              <div className="text-center">{s.number ?? "-"}</div>
              <div className="text-center">{s.matches}</div>
              <div className="text-center">{isGk ? s.cleanSheets : s.goals}</div>
              <div className="text-center">{s.assists}</div>
              <div className="text-center text-[#8295AA]/40">-</div>
              <div className="text-center">
                {s.ratingCount > 0
                  ? (s.ratingSum / s.ratingCount).toFixed(1)
                  : "-"}
              </div>
            </div>
          ))}

          <div className="grid grid-cols-[1.2fr_0.4fr_0.7fr_0.7fr_0.9fr_0.6fr_0.6fr] gap-1 pt-2 text-[10px] font-black text-white">
            <div>合計</div>
            <div className="text-center">-</div>
            <div className="text-center">{totalStats.matches}</div>
            <div className="text-center">{isGk ? totalStats.cleanSheets : totalStats.goals}</div>
            <div className="text-center">{totalStats.assists}</div>
            <div className="text-center text-[#8295AA]/40">-</div>
            <div className="text-center">
              {totalStats.ratingCount > 0
                ? (totalStats.ratingSum / totalStats.ratingCount).toFixed(1)
                : "-"}
            </div>
          </div>

          {seasonStats.length === 0 && (
            <p className="py-6 text-center text-xs font-bold text-[#8295AA]">
              シーズン別の成績がありません
            </p>
          )}
        </div>

        <p className="mt-4 text-[10px] font-black text-white">獲得タイトル</p>
        <div className="mt-1 flex flex-col items-center justify-center rounded-lg border border-white/10 bg-[#071321] p-8 text-center">
          <Trophy className="h-8 w-8 text-[#8295AA]" />
          <p className="mt-2 text-sm font-bold text-[#8295AA]">
            獲得タイトルはまだありません
          </p>
        </div>
      </div>
    </div>
  );
}

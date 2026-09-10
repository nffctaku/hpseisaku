"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Trophy,
  Target,
  Users,
  Shield,
  Swords,
  ChevronRight,
  User,
  LayoutGrid,
} from "lucide-react";
import type { SeasonDetail, SquadPlayer, LeaderEntry } from "../lib/season-records";
import { positionCategory } from "../lib/season-records";

function getPositionLabel(position?: string) {
  const p = position?.toUpperCase() || "";
  if (p.includes("GK")) return "GK";
  if (p.includes("DF")) return "DF";
  if (p.includes("MF")) return "MF";
  if (p.includes("FW")) return "FW";
  return position || "-";
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-[#071321] p-3 text-center shadow-[0_8px_20px_rgba(0,0,0,0.22)]">
      <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-[28px] font-black leading-none tracking-[-0.05em] text-white">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] font-bold text-slate-500">{sub}</p> : null}
    </div>
  );
}

function LeaderCard({
  title,
  sub,
  player,
  value,
  suffix,
}: {
  title: string;
  sub: string;
  player?: LeaderEntry["player"];
  value: number;
  suffix: string;
}) {
  return (
    <Link
      href={player ? `/admin/club/history/players/${player.playerId}` : "#"}
      className="group relative flex h-[140px] min-h-[140px] flex-col justify-between overflow-hidden rounded-lg border border-white/10 bg-slate-950 p-3 text-left shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition hover:opacity-90"
    >
      {player?.photoUrl ? (
        <Image src={player.photoUrl} alt="" fill className="object-cover object-top opacity-90" sizes="50vw" />
      ) : (
        <div className="absolute inset-0 bg-slate-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06101f]/50 from-[40%] to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#06101f]/80 via-transparent to-transparent" />
      <div className="relative z-10">
        <h2 className="text-[11px] font-black leading-none tracking-wide text-white">{title}</h2>
        <p className="mt-0.5 text-[6px] font-black tracking-[0.18em] text-slate-400">{sub}</p>
      </div>
      <div className="relative z-10 mt-6 max-w-[55%]">
        <p className="text-[42px] font-black leading-none tracking-[-0.06em] text-yellow-400 drop-shadow-sm">{value}</p>
        <p className="mt-1 break-words text-xs font-black leading-tight text-white">{player?.playerName || "-"}</p>
        <p className="mt-0.5 text-[10px] font-bold text-slate-300">{suffix}</p>
      </div>
    </Link>
  );
}

function PlayerRow({ player, showValue }: { player: SquadPlayer; showValue?: { label: string; value: string | number } }) {
  return (
    <Link
      href={`/admin/club/history/players/${player.playerId}`}
      className="flex items-center gap-3 border-b border-white/[0.07] py-3 transition active:opacity-70"
    >
      <div className="relative h-12 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-slate-900">
        {player.photoUrl ? (
          <Image src={player.photoUrl} alt="" fill className="object-cover" sizes="48px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-500">
            <User className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#0A1F3D] px-1.5 py-0.5 text-[10px] font-black text-white">
            {getPositionLabel(player.position)}
          </span>
          <span className="truncate text-sm font-bold text-white">{player.playerName}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {player.matches}試合 {player.goals}G {player.assists}A
        </p>
      </div>
      {showValue ? (
        <div className="text-right">
          <p className="text-lg font-black text-white">{showValue.value}</p>
          <p className="text-[10px] text-slate-500">{showValue.label}</p>
        </div>
      ) : null}
    </Link>
  );
}

function SectionTitle({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) {
  return (
    <div className="mb-4 mt-8 flex items-center gap-3">
      <Icon className="h-4 w-4 text-blue-500" />
      <div>
        <h2 className="text-[13px] font-black uppercase tracking-[0.22em] text-white">{title}</h2>
        {sub ? <p className="text-[10px] font-bold text-slate-500">{sub}</p> : null}
      </div>
      <div className="ml-auto h-px flex-1 bg-white/10" />
    </div>
  );
}

export function SeasonDetailView({ detail, season }: { detail: SeasonDetail; season: string }) {
  const mostUsedXIGroups = ["GK", "DF", "MF", "FW"].map((cat) => ({
    cat,
    players: (detail.mostUsedXI?.players || []).filter((p) => positionCategory(p.position) === cat),
  }));

  const matchesUrl = `/admin/matches?season=${encodeURIComponent(season)}`;

  return (
    <div className="relative min-h-screen bg-[#050a12] text-white">
      <div className="absolute inset-x-0 top-0 h-1 bg-red-500" />

      <section className="relative z-10 min-h-[180px] overflow-hidden sm:min-h-[220px] lg:min-h-[260px]">
        <Image
          src="/シーズン記録背景.jpg"
          alt=""
          fill
          priority
          className="object-cover object-center opacity-70"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050a12]/85 via-transparent to-[#050a12]/25" />
        <div className="relative z-10 flex min-h-[180px] flex-col justify-end px-4 pb-2 pt-20 sm:min-h-[220px] sm:px-6 sm:pb-3 sm:pt-24 lg:min-h-[260px] lg:pt-28">
          <h1 className="text-[36px] font-black leading-[0.92] tracking-[-0.08em] text-slate-100 sm:text-5xl">
            {season} <span className="text-yellow-400">SEASON</span>
          </h1>
          <p className="mt-1 text-xs font-bold leading-none text-slate-400">
            シーズン記録
          </p>
          <p className="mt-1 text-[10px] font-black tracking-[0.18em] text-[#8295AA]">
            {detail.matches}試合 {detail.wins}勝 {detail.draws}分 {detail.losses}敗 / {detail.titleCount} TITLES
          </p>
        </div>
      </section>

      <section className="relative z-10 px-4 pt-4 sm:px-6">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-400" />
          <h2 className="text-[13px] font-black uppercase tracking-[0.22em] text-white">Competitions</h2>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {detail.competitionResults.map((c) => (
            <div
              key={c.competitionId}
              className="flex flex-col items-center justify-between rounded-xl border border-white/10 bg-[#071321] p-2 text-center"
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white p-1">
                {c.competitionLogo ? (
                  <Image src={c.competitionLogo} alt="" width={40} height={40} className="h-8 w-8 object-contain" />
                ) : (
                  <Trophy className="h-5 w-5 text-slate-400" />
                )}
              </div>
              <p className="mt-1.5 text-[9px] font-bold leading-tight text-white line-clamp-2">{c.competitionName}</p>
              <p className={`mt-0.5 text-[10px] font-black ${c.isChampion ? "text-yellow-400" : "text-slate-300"}`}>
                {c.isChampion ? "優勝" : typeof c.rank === "number" ? `第${c.rank}位` : c.result === "LEAGUE" ? "-" : c.result}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="px-4 pb-24 pt-5 sm:px-6">
        <SectionTitle icon={LayoutGrid} title="Season Summary" sub="シーズン概要" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="試合" value={detail.matches} />
          <StatCard label="勝" value={detail.wins} />
          <StatCard label="分" value={detail.draws} />
          <StatCard label="敗" value={detail.losses} />
          <StatCard label="得点" value={detail.goalsFor} sub="GOALS FOR" />
          <StatCard label="失点" value={detail.goalsAgainst} sub="GOALS AGAINST" />
          <StatCard label="得失点差" value={detail.goalDifference > 0 ? `+${detail.goalDifference}` : detail.goalDifference} sub="GD" />
          <StatCard label="タイトル" value={detail.titleCount} sub="TITLES" />
        </div>

        <SectionTitle icon={Trophy} title="Competitions" sub="大会成績" />
        <div className="rounded-xl border border-white/10 bg-[#071321] p-4 shadow-[0_8px_20px_rgba(0,0,0,0.22)]">
          {detail.competitionResults.length === 0 ? (
            <p className="text-sm text-slate-500">大会データがありません</p>
          ) : (
            <div className="space-y-3">
              {detail.competitionResults.map((c) => (
                <div
                  key={c.competitionId}
                  className="flex items-center justify-between border-b border-white/[0.07] pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-bold text-white">{c.competitionName}</p>
                    <p className="text-[11px] text-slate-500">{c.record}</p>
                  </div>
                  <div className={`text-right ${c.isChampion ? "text-yellow-400" : "text-white"}`}>
                    <p className="text-[15px] font-black">{c.result}</p>
                    {c.isChampion ? (
                      <Trophy className="ml-auto h-4 w-4 text-yellow-400" />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SectionTitle icon={Target} title="Season Leaders" sub="シーズンリーダー" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <LeaderCard
            title="MOST MATCHES"
            sub="最多出場"
            player={detail.leaders.matches?.player}
            value={detail.leaders.matches?.value ?? 0}
            suffix="試合"
          />
          <LeaderCard
            title="TOP SCORER"
            sub="最多得点"
            player={detail.leaders.goals?.player}
            value={detail.leaders.goals?.value ?? 0}
            suffix="G"
          />
          <LeaderCard
            title="TOP ASSIST"
            sub="最多アシスト"
            player={detail.leaders.assists?.player}
            value={detail.leaders.assists?.value ?? 0}
            suffix="A"
          />
          <LeaderCard
            title="MOST CS"
            sub="最多クリーンシート"
            player={detail.leaders.cleanSheets?.player}
            value={detail.leaders.cleanSheets?.value ?? 0}
            suffix="CS"
          />
        </div>

        <SectionTitle icon={Shield} title="Most Used XI" sub="最多起用スターティング11" />
        {detail.mostUsedXI ? (
          <div className="rounded-xl border border-white/10 bg-[#071321] p-4 shadow-[0_8px_20px_rgba(0,0,0,0.22)]">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-2xl font-black text-white">{detail.mostUsedXI.formation}</p>
                <p className="text-[10px] font-black tracking-[0.18em] text-slate-500">
                  {detail.mostUsedXI.count} STARTS{detail.mostUsedXI.isTie ? " (同率)" : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-slate-400">FORMATION</p>
              </div>
            </div>
            <div className="space-y-3">
              {mostUsedXIGroups.map(
                (g) =>
                  g.players.length > 0 && (
                    <div key={g.cat} className="flex flex-wrap items-center justify-center gap-2">
                      {g.players.map((p) => (
                        <Link
                          key={p.playerId}
                          href={`/admin/club/history/players/${p.playerId}`}
                          className="min-w-[80px] rounded-lg border border-white/10 bg-[#0A1F3D] px-2 py-2 text-center transition hover:opacity-80"
                        >
                          <p className="text-[10px] font-black text-slate-400">{g.cat}</p>
                          <p className="mt-0.5 text-xs font-bold text-white">{p.playerName}</p>
                        </Link>
                      ))}
                    </div>
                  )
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">スターティング11データがありません</p>
        )}

        {detail.mostUsedFormation ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-[#071321] p-4 shadow-[0_8px_20px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black tracking-[0.18em] text-slate-500">MOST USED FORMATION</p>
                <p className="mt-1 text-2xl font-black text-white">{detail.mostUsedFormation.formation}</p>
              </div>
              <div className="text-right">
                <p className="text-[28px] font-black text-blue-500">{detail.mostUsedFormation.usage}%</p>
                <p className="text-[10px] font-bold text-slate-400">
                  {detail.mostUsedFormation.count} / {detail.mostUsedFormation.total}試合
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <SectionTitle icon={Users} title="Season Squad" sub="シーズンスカッド" />
        <div className="space-y-5">
          {Object.entries(detail.squad).length === 0 ? (
            <p className="text-sm text-slate-500">選手データがありません</p>
          ) : (
            Object.entries(detail.squad).map(([cat, players]) => (
              <div key={cat}>
                <h3 className="mb-2 text-xs font-black tracking-[0.18em] text-blue-500">{cat}</h3>
                <div className="rounded-xl border border-white/10 bg-[#071321] p-3 shadow-[0_8px_20px_rgba(0,0,0,0.22)]">
                  {players.map((p) => (
                    <PlayerRow key={p.playerId} player={p} />
                  ))}
                </div>
              </div>
            )))
          }
        </div>

        <SectionTitle icon={Trophy} title="Titles" sub="獲得タイトル" />
        {detail.titles.length === 0 ? (
          <p className="text-sm text-slate-500">このシーズンのタイトルはありません</p>
        ) : (
          <div className="space-y-2">
            {detail.titles.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#071321] px-4 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
              >
                <Trophy className="h-5 w-5 flex-shrink-0 text-yellow-400" />
                <div>
                  <p className="text-sm font-bold text-white">{t.competitionName}</p>
                  <p className="text-[10px] font-black text-slate-500">{t.season}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Link
            href={matchesUrl}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-[#071321] px-4 py-4 shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:opacity-80"
          >
            <div className="flex items-center gap-3">
              <Swords className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-bold text-white">{season}の全試合を見る</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}

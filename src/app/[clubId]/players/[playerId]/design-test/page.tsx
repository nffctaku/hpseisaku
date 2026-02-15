import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import { PublicPlayerHexChart } from "@/components/public-player-hex-chart";
import { SnapPager } from "@/components/SnapPager";
import { PositionMap } from "./components/PositionMap";
import { OverallTrendChart } from "./components/OverallTrendChart";
import {
  getLeagueCompetitionLabel,
  getLeaguePlayerStats,
  getSeasonCompetitionStats,
} from "./lib/playerStats";
import { SeasonBreakdownSlide } from "./components/SeasonBreakdownSlide";
import { DesignTestPagerTabs } from "./components/DesignTestPagerTabs";
import { getPlayer, type LegalPageItem } from "./lib/getPlayer";
import { MatchStatsSlide } from "./components/MatchStatsSlide";
import {
  getSeasonDataEntry,
  hasSeasonCandidate,
  inferLatestSeasonFromPlayer,
  toSlashSeason,
} from "./lib/season";
import { computeOverall } from "./lib/params";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bebas_Neue } from "next/font/google";
import { Suspense } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const numberFont = Bebas_Neue({ weight: "400", subsets: ["latin"], display: "swap" });

function formatBirthDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return v;
}

function formatPreferredFoot(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v === "left") return "左";
  if (v === "right") return "右";
  if (v === "both") return "両";
  return v;
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp99(n: unknown): number {
  const v = toFiniteNumber(n);
  if (v == null) return 0;
  return Math.max(0, Math.min(99, v));
}

export default async function PlayerDesignTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; playerId: string }>;
  searchParams: Promise<{ season?: string; design?: string }>;
}) {
  const { clubId, playerId } = await params;
  const { season, design } = await searchParams;

  const result = await getPlayer(clubId, playerId);
  if (!result) return notFound();

  const { clubName, player, ownerUid, legalPages, gameTeamUsage, publicPlayerParamsEnabled } = result as any;

  const seasonData = player?.seasonData && typeof player.seasonData === "object" ? (player.seasonData as any) : {};
  const inferredSeason = season ? null : inferLatestSeasonFromPlayer(player);
  const effectiveSeason = season ?? inferredSeason ?? null;
  const currentSeasonData = effectiveSeason ? getSeasonDataEntry(seasonData, effectiveSeason) : undefined;

  const showParamsOnPublic = (() => {
    if (typeof publicPlayerParamsEnabled === "boolean") return publicPlayerParamsEnabled;
    const v = (currentSeasonData as any)?.showParamsOnPublic;
    if (typeof v === "boolean") return v;
    return true;
  })();

  const birthDateText = formatBirthDate((player as any)?.birthDate ?? (currentSeasonData as any)?.birthDate ?? (player as any)?.birthday);
  const ageValue = (currentSeasonData as any)?.age ?? (player as any)?.age ?? null;
  const birthLine = birthDateText ? `${birthDateText}${typeof ageValue === "number" && Number.isFinite(ageValue) ? ` (${ageValue})` : ""}` : null;

  const nationalityText = (currentSeasonData as any)?.nationality ?? (player as any)?.nationality ?? null;

  const heightValue = (currentSeasonData as any)?.height ?? (player as any)?.height ?? null;
  const weightValue = (currentSeasonData as any)?.weight ?? (player as any)?.weight ?? null;
  const preferredFootText = formatPreferredFoot((currentSeasonData as any)?.preferredFoot ?? (player as any)?.preferredFoot);

  const mainPosition = (currentSeasonData as any)?.mainPosition ?? (player as any)?.mainPosition ?? null;
  const subPositions = (currentSeasonData as any)?.subPositions ?? (player as any)?.subPositions ?? null;

  const seasonParams = (currentSeasonData as any)?.params;
  const paramItems = Array.isArray((seasonParams as any)?.items)
    ? ((seasonParams as any).items as any[])
    : Array.isArray((player as any)?.params?.items)
      ? (((player as any).params.items as any[]) ?? [])
      : [];

  const filledItems = Array.from({ length: 6 }, (_, i) => {
    const item = paramItems?.[i] as any;
    return {
      label: typeof item?.label === "string" ? item.label.slice(0, 8) : "",
      value: toFiniteNumber(item?.value) != null ? clamp99(toFiniteNumber(item?.value)) : 0,
    };
  });
  const defaultParamLabels = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"];
  const paramLabels = filledItems.map((i, idx) => (i.label && i.label.trim().length > 0 ? i.label : defaultParamLabels[idx]));
  const paramValues = filledItems.map((i) => i.value);

  const overall =
    toFiniteNumber((seasonParams as any)?.overall) != null
      ? clamp99(toFiniteNumber((seasonParams as any).overall))
      : toFiniteNumber((player as any)?.params?.overall) != null
        ? clamp99(toFiniteNumber((player as any).params.overall))
        : computeOverall(paramItems);

  const hasParams =
    (Array.isArray(paramItems)
      ? paramItems.some((i) => (typeof (i as any)?.label === "string" && String((i as any).label).trim().length > 0)) ||
        paramItems.some((i) => toFiniteNumber((i as any)?.value) != null)
      : false) ||
    (toFiniteNumber((seasonParams as any)?.overall) != null || toFiniteNumber((player as any)?.params?.overall) != null);

  const overallTrendRows = (() => {
    const sd = seasonData && typeof seasonData === "object" ? seasonData : {};
    const rows = Object.entries(sd)
      .map(([seasonKey, entry]) => {
        const seasonId = toSlashSeason(String(seasonKey || "").trim());
        const params = (entry as any)?.params;
        const items = Array.isArray((params as any)?.items) ? ((params as any).items as any[]) : [];
        const o =
          toFiniteNumber((params as any)?.overall) != null
            ? clamp99(toFiniteNumber((params as any).overall))
            : computeOverall(items);
        return {
          season: seasonId,
          overall: clamp99(o),
          hasAny:
            toFiniteNumber((params as any)?.overall) != null ||
            (Array.isArray(items) ? items.some((it) => toFiniteNumber((it as any)?.value) != null) : false),
        };
      })
      .filter((r) => r.season && r.hasAny);
    rows.sort((a, b) => a.season.localeCompare(b.season));
    return rows
      .map(({ season, overall }) => ({ season, overall }))
      .slice(-5);
  })();

  const [leagueStats, leagueCompetitionLabel, seasonCompetitionStats] = effectiveSeason
    ? await Promise.all([
        getLeaguePlayerStats(ownerUid, playerId, player, effectiveSeason),
        getLeagueCompetitionLabel(ownerUid, effectiveSeason),
        getSeasonCompetitionStats(ownerUid, playerId, player, effectiveSeason),
      ])
    : [
        { appearances: 0, minutes: 0, goals: 0, assists: 0 },
        null as string | null,
        [],
      ];

  const otherCompetitionStats = seasonCompetitionStats.filter((r) => r.format !== "league" && r.format !== "league_cup");
  const baseQuery = season ? `?season=${encodeURIComponent(season)}` : "";

  const page1 = (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold">基本情報</div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
        {birthLine ? (
          <div className="flex items-baseline justify-between gap-4">
            <div className="text-white/70">生年月日/年齢</div>
            <div className="font-semibold tabular-nums text-right">{birthLine}</div>
          </div>
        ) : null}

        <div className="flex items-baseline justify-between gap-4">
          <div className="text-white/70">出身</div>
          <div className="font-semibold text-right break-words">{nationalityText ? String(nationalityText) : "-"}</div>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <div className="text-white/70">身長</div>
          <div className="font-semibold tabular-nums text-right">{typeof heightValue === "number" && Number.isFinite(heightValue) ? `${heightValue} cm` : heightValue ? String(heightValue) : "-"}</div>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <div className="text-white/70">体重</div>
          <div className="font-semibold tabular-nums text-right">{typeof weightValue === "number" && Number.isFinite(weightValue) ? `${weightValue} kg` : weightValue ? String(weightValue) : "-"}</div>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <div className="text-white/70">年齢</div>
          <div className="font-semibold tabular-nums text-right">{typeof ageValue === "number" && Number.isFinite(ageValue) ? `${ageValue}` : "-"}</div>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <div className="text-white/70">利き足</div>
          <div className="font-semibold text-right">{preferredFootText ?? "-"}</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            {(effectiveSeason ? toSlashSeason(effectiveSeason) : "-") + (leagueCompetitionLabel ? ` / ${leagueCompetitionLabel}` : "")}
          </div>
          {null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-white/70">試合</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">{leagueStats.appearances}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-white/70">得点</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">{leagueStats.goals}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-white/70">アシスト</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">{leagueStats.assists}</div>
          </div>
        </div>
      </div>

      {otherCompetitionStats.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">その他大会</div>
            {null}
          </div>

          <SnapPager className="mt-3 -mx-4 px-4 overflow-x-auto snap-x snap-mandatory scroll-smooth overscroll-x-contain" settleMs={140}>
            <div className="flex gap-3">
              {otherCompetitionStats.map((row) => (
                <div
                  key={row.competitionId}
                  className="snap-start w-[78vw] max-w-[420px] shrink-0 rounded-2xl border border-white/10 bg-black/10 p-3 [scroll-snap-stop:always]"
                >
                  <div className="flex items-center gap-2">
                    {row.competitionLogoUrl ? (
                      <div className="relative h-6 w-6 overflow-hidden rounded-full">
                        <Image src={row.competitionLogoUrl} alt={row.competitionName} fill sizes="24px" className="object-contain" />
                      </div>
                    ) : null}
                    <div className="min-w-0 text-sm font-semibold truncate">{row.competitionName}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="text-[11px] text-white/70">試合</div>
                      <div className="mt-0.5 text-lg font-bold tabular-nums">{row.stats.appearances}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="text-[11px] text-white/70">得点</div>
                      <div className="mt-0.5 text-lg font-bold tabular-nums">{row.stats.goals}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="text-[11px] text-white/70">アシスト</div>
                      <div className="mt-0.5 text-lg font-bold tabular-nums">{row.stats.assists}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SnapPager>
        </div>
      ) : null}

      {mainPosition || (Array.isArray(subPositions) && subPositions.length > 0) ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold">ポジション</div>
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mx-auto h-[110px] w-full max-w-[240px]">
              <PositionMap mainPosition={typeof mainPosition === "string" ? mainPosition : undefined} subPositions={Array.isArray(subPositions) ? subPositions : undefined} />
            </div>
          </div>
        </div>
      ) : null}

      {hasParams && showParamsOnPublic ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">パラメータ</div>
            <div className="text-xs text-white/50">横にスワイプ</div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <div className="flex gap-3 snap-x snap-mandatory">
              <div className="snap-start w-[85vw] max-w-[360px] shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">能力値</div>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="mx-auto w-full max-w-[220px]">
                    <PublicPlayerHexChart labels={paramLabels} values={paramValues} overall={overall} theme="dark" />
                  </div>
                </div>
              </div>

              <div className="snap-start w-[85vw] max-w-[360px] shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">総合値推移</div>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <OverallTrendChart rows={overallTrendRows} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {player.profile ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold">選手紹介</div>
          <p className="mt-3 text-sm text-white/80 whitespace-pre-wrap">{player.profile}</p>
        </div>
      ) : null}
    </div>
  );

  const page1CompetitionOnly = (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold">大会成績</div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            {(effectiveSeason ? toSlashSeason(effectiveSeason) : "-") + (leagueCompetitionLabel ? ` / ${leagueCompetitionLabel}` : "")}
          </div>
          {null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-white/70">試合</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">{leagueStats.appearances}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-white/70">得点</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">{leagueStats.goals}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-white/70">アシスト</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">{leagueStats.assists}</div>
          </div>
        </div>
      </div>

      {otherCompetitionStats.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">その他大会</div>
            {null}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            {otherCompetitionStats.map((row) => (
              <div key={row.competitionId} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <div className="flex items-center gap-2">
                  {row.competitionLogoUrl ? (
                    <div className="relative h-6 w-6 overflow-hidden rounded-full">
                      <Image src={row.competitionLogoUrl} alt={row.competitionName} fill sizes="24px" className="object-contain" />
                    </div>
                  ) : null}
                  <div className="min-w-0 text-sm font-semibold truncate">{row.competitionName}</div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] text-white/70">試合</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums">{row.stats.appearances}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] text-white/70">得点</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums">{row.stats.goals}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] text-white/70">アシスト</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums">{row.stats.assists}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const page2 = (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <Suspense
        fallback={
          <div className="mt-3 space-y-3">
            <div className="h-5 w-32 rounded bg-white/10" />
            <div className="h-16 rounded-xl border border-white/10 bg-white/5" />
            <div className="h-16 rounded-xl border border-white/10 bg-white/5" />
            <div className="h-16 rounded-xl border border-white/10 bg-white/5" />
          </div>
        }
      >
        <MatchStatsSlide ownerUid={ownerUid} playerId={playerId} targetSeason={effectiveSeason} />
      </Suspense>
    </div>
  );

  const page3 = (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-10">
            <div className="h-7 w-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </div>
        }
      >
        <SeasonBreakdownSlide ownerUid={ownerUid} playerId={playerId} playerData={player} />
      </Suspense>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <div className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link href={`/${clubId}/players${baseQuery}`} className="text-sm text-muted-foreground hover:underline">
                &larr; 選手一覧
              </Link>

              <div className="min-w-0 flex-1 px-2 text-center">
                <div className="truncate text-sm font-semibold text-foreground">{player.name}</div>
              </div>

              <div />
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6">
          <div className="mt-8">
            <div className="relative overflow-hidden rounded-2xl border bg-zinc-950 text-white">
              <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.9),transparent_45%),radial-gradient(circle_at_85%_15%,rgba(59,130,246,0.85),transparent_45%),radial-gradient(circle_at_60%_85%,rgba(244,63,94,0.75),transparent_45%)]" />

              <div className="relative">
                <div className="md:hidden relative aspect-[16/10] sm:aspect-[16/9]">
                  {player.photoUrl ? (
                    <Image
                      src={player.photoUrl}
                      alt={player.name}
                      fill
                      priority
                      sizes="(max-width: 768px) 100vw, 100vw"
                      className="object-cover object-[50%_30%]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-white/5" />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                  <div className="absolute left-0 right-0 bottom-0 p-4 sm:p-6">
                    <div className="flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <div className={`${numberFont.className} text-6xl sm:text-7xl font-black tracking-tighter leading-none`}>
                          {currentSeasonData?.number ?? player.number ?? "-"}
                        </div>
                        <h1 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight break-words">{player.name}</h1>
                        <div className="mt-1 text-sm sm:text-base text-white/80">{null}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden md:block p-6">
                  <div className="flex gap-6 items-start">
                    <div className="w-[420px] shrink-0">
                      <div className="relative h-[580px] w-[420px] overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        {player.photoUrl ? (
                          <Image
                            src={player.photoUrl}
                            alt={player.name}
                            fill
                            priority
                            sizes="(min-width: 768px) 420px, 100vw"
                            className="object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-white/5" />
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 h-[580px] min-h-0 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                          <div className={`${numberFont.className} text-7xl font-black tracking-tighter leading-none`}>
                            {currentSeasonData?.number ?? player.number ?? "-"}
                          </div>
                          <h1 className="mt-1 text-4xl font-black tracking-tight break-words">{player.name}</h1>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                          <div className="grid grid-cols-1 gap-2 text-sm">
                            <div className="flex items-baseline justify-between gap-4">
                              <div className="text-white/70">出身</div>
                              <div className="font-semibold text-right break-words">{nationalityText ? String(nationalityText) : "-"}</div>
                            </div>

                            <div className="flex items-baseline justify-between gap-4">
                              <div className="text-white/70">身長</div>
                              <div className="font-semibold tabular-nums text-right">{typeof heightValue === "number" && Number.isFinite(heightValue) ? `${heightValue} cm` : heightValue ? String(heightValue) : "-"}</div>
                            </div>

                            <div className="flex items-baseline justify-between gap-4">
                              <div className="text-white/70">体重</div>
                              <div className="font-semibold tabular-nums text-right">{typeof weightValue === "number" && Number.isFinite(weightValue) ? `${weightValue} kg` : weightValue ? String(weightValue) : "-"}</div>
                            </div>

                            <div className="flex items-baseline justify-between gap-4">
                              <div className="text-white/70">年齢</div>
                              <div className="font-semibold tabular-nums text-right">{typeof ageValue === "number" && Number.isFinite(ageValue) ? `${ageValue}` : "-"}</div>
                            </div>

                            <div className="flex items-baseline justify-between gap-4">
                              <div className="text-white/70">利き足</div>
                              <div className="font-semibold text-right">{preferredFootText ?? "-"}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex-1 min-h-0">
                        <div className="flex gap-4 items-start h-full min-h-0">
                          <div className="w-[280px] min-h-0 flex flex-col">
                            <div className="text-sm font-semibold">ポジション</div>
                            <div className="mt-2 flex-1 min-h-0 rounded-xl border border-white/10 bg-white/5 p-2 overflow-hidden">
                              <div className="mx-auto w-full max-w-[210px] h-full overflow-hidden">
                                <PositionMap
                                  mainPosition={typeof mainPosition === "string" ? mainPosition : undefined}
                                  subPositions={Array.isArray(subPositions) ? subPositions : undefined}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                            <div className="text-sm font-semibold">選手紹介</div>
                            <p className="mt-3 text-sm text-white/80 whitespace-pre-wrap line-clamp-12">{player.profile || "-"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  {hasParams && showParamsOnPublic ? (
                    <div className="hidden md:block">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-sm font-semibold">能力値</div>
                          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="mx-auto w-full max-w-[240px]">
                              <PublicPlayerHexChart labels={paramLabels} values={paramValues} overall={overall} theme="dark" />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-sm font-semibold">総合値推移</div>
                          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            <OverallTrendChart rows={overallTrendRows} height={220} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="md:hidden">
                    <DesignTestPagerTabs targetId="design-test-pager" />
                  </div>

                    <div className="mt-5 md:hidden">
                      <SnapPager
                        id="design-test-pager"
                        className="-mx-4 px-4 overflow-x-auto snap-x snap-mandatory scroll-smooth overscroll-x-contain"
                        settleMs={140}
                      >
                        <div className="flex gap-4">
                          <div className="snap-start w-[92vw] max-w-[520px] shrink-0 [scroll-snap-stop:always]" data-design-slide="1">
                            {page1}
                          </div>
                          <div className="snap-start w-[92vw] max-w-[520px] shrink-0 [scroll-snap-stop:always]" data-design-slide="2">
                            {page2}
                          </div>
                          <div className="snap-start w-[92vw] max-w-[520px] shrink-0 [scroll-snap-stop:always]" data-design-slide="3">
                            {page3}
                          </div>
                        </div>
                      </SnapPager>
                    </div>

                    <div className="hidden md:grid md:grid-cols-3 md:gap-4 mt-5">
                      <div className="min-w-0">{page1CompetitionOnly}</div>
                      <div className="min-w-0">{page2}</div>
                      <div className="min-w-0">{page3}</div>
                    </div>
                </div>
              </div>
            </div>
          </div>

          <PartnerStripClient clubId={clubId} />
          <ClubFooter clubId={clubId} clubName={clubName} legalPages={legalPages} />
        </div>
      </div>
    </div>
  );
}

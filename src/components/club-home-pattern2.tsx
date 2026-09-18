"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, List, Play, Trophy, Users } from "lucide-react";
import type { MatchDetails } from "@/types/match";
import type { NewsArticle } from "@/types/news";

type Video = {
  id: string;
  title: string;
  youtubeVideoId: string;
  publishedAt?: string;
};

type Player = {
  id: string;
  name?: string;
  number?: number | string;
  position?: string;
  photoUrl?: string;
  __teamId?: string;
};

type Competition = {
  id: string;
  name?: string;
  season?: string;
  showOnHome?: boolean;
};

type Standing = {
  id: string;
  rank: number;
  teamName: string;
  logoUrl?: string;
  played: number;
  goalDifference: number;
  points: number;
};

type ClubHomePattern2Props = {
  clubId: string;
  clubName: string;
  logoUrl?: string | null;
  accentColor?: string;
  foundedYear?: string;
  stadiumPhotoUrl?: string;
  heroNews: NewsArticle[];
  news: NewsArticle[];
  videos: Video[];
  recentMatches: MatchDetails[];
  upcomingMatches: MatchDetails[];
  competitions: Competition[];
  mainTeamId?: string | null;
  players?: Player[];
};

function formatDate(value: unknown, separator = ".") {
  const date = resolveDate(value);
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${separator}${m}${separator}${d}`;
}

function resolveDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any)?.toDate === "function") {
    const d = (value as any).toDate();
    return d instanceof Date ? d : null;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function resultFor(match: MatchDetails, mainTeamId?: string | null): "W" | "D" | "L" | "-" {
  if (typeof match.scoreHome !== "number" || typeof match.scoreAway !== "number") return "-";
  const isHome = mainTeamId ? match.homeTeam === mainTeamId : true;
  const my = isHome ? match.scoreHome : match.scoreAway;
  const opp = isHome ? match.scoreAway : match.scoreHome;
  if (my > opp) return "W";
  if (my < opp) return "L";
  return "D";
}

function uniqueRecentMatches(matches: MatchDetails[], mainTeamId?: string | null) {
  const seen = new Set<string>();
  return matches
    .filter((match) => {
      if (!match) return false;
      if (typeof match.scoreHome !== "number" || typeof match.scoreAway !== "number") return false;
      if (mainTeamId && match.homeTeam !== mainTeamId && match.awayTeam !== mainTeamId) return false;
      const key = `${match.competitionId}:${match.roundId}:${match.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (resolveDate(b.matchDate)?.getTime() || 0) - (resolveDate(a.matchDate)?.getTime() || 0))
    .slice(0, 3);
}

function sectionTitle(en: string, ja: string, accentColor: string, href?: string, label = "すべて見る") {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="border-l-4 pl-3" style={{ borderColor: accentColor }}>
        <h2 className="font-serif text-2xl font-black tracking-[-0.04em] text-neutral-950">{en}</h2>
        <p className="text-[11px] font-bold text-slate-500">{ja}</p>
      </div>
      {href ? (
        <Link href={href} className="flex min-h-11 items-center gap-1 text-xs font-bold text-neutral-900">
          {label} <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}

function logoNode(src: string | undefined, name: string, className = "h-7 w-7") {
  return src ? (
    <Image src={src} alt={name} width={40} height={40} className={`${className} rounded-full bg-white object-contain`} />
  ) : (
    <div className={`${className} rounded-full bg-slate-200`} />
  );
}

function LatestMatches({ clubId, matches, upcomingMatch, mainTeamId, accentColor }: { clubId: string; matches: MatchDetails[]; upcomingMatch?: MatchDetails; mainTeamId?: string | null; accentColor: string }) {
  const MatchCard = ({ match, isUpcoming, borderClass }: { match: MatchDetails; isUpcoming?: boolean; borderClass?: string }) => {
    const result = !isUpcoming ? resultFor(match, mainTeamId) : null;
    const resultClass = result === "W" ? "bg-emerald-600" : result === "L" ? "bg-red-600" : "bg-slate-500";
    const href = match.competitionId && match.roundId && match.id ? `/${clubId}/matches/${match.competitionId}/${match.roundId}/${match.id}` : "";
    const side = mainTeamId && match.awayTeam === mainTeamId ? "AWAY" : "HOME";
    const content = (
      <div className={`grid min-h-[82px] px-3 py-3 ${isUpcoming ? "grid-cols-1 border-b-0" : `grid-cols-[1fr_44px] gap-3 ${borderClass || "border-b border-slate-100"}`}`}>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <span>{formatDate(match.matchDate, "/")}</span>
            <span>
              {match.roundId === 'single' || (match.roundName || '').trim() === '単発'
                ? (match.competitionName || 'MATCH')
                : (match.roundName || match.competitionName || 'MATCH')}
            </span>
            <span>{side}</span>
          </div>
          <div className="grid grid-cols-[1fr_6rem_1fr] items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {logoNode(match.homeTeamLogo, match.homeTeamName)}
              <span className="min-w-0 text-xs font-bold leading-tight text-slate-700 line-clamp-2 break-keep">{match.homeTeamName}</span>
            </div>
            <div className="text-center text-xl font-black tabular-nums text-neutral-950">
              {typeof match.scoreHome === "number" && typeof match.scoreAway === "number"
                ? `${match.scoreHome} - ${match.scoreAway}`
                : "VS"}
            </div>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <span className="min-w-0 text-right text-xs font-bold leading-tight text-slate-700 line-clamp-2 break-keep">{match.awayTeamName}</span>
              {logoNode(match.awayTeamLogo, match.awayTeamName)}
            </div>
          </div>
        </div>
        {!isUpcoming ? <div className={`flex h-8 w-8 items-center justify-center self-center justify-self-center rounded-full text-xs font-black text-white ${resultClass}`}>{result}</div> : null}
      </div>
    );
    return href ? <Link href={href}>{content}</Link> : <div>{content}</div>;
  };

  const showEmpty = matches.length === 0 && !upcomingMatch;
  return (
    <section>
      {sectionTitle("LATEST MATCHES", "直近3試合と次の試合", accentColor, `/${clubId}/results`)}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {showEmpty ? (
          <p className="px-4 py-4 text-sm text-slate-500">このシーズンの試合結果はまだありません</p>
        ) : (
          <>
            {matches.map((match, index) => (
              <MatchCard
                key={`${match.competitionId}:${match.roundId}:${match.id}`}
                match={match}
                borderClass={index === matches.length - 1 ? "border-b-0" : "border-b border-slate-100"}
              />
            ))}
            {upcomingMatch ? (
              <>
                <div className={`flex items-center justify-center gap-2 border-slate-100 bg-slate-50/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 ${matches.length > 0 ? "border-t border-b" : "border-b"}`}>
                  <span>NEXT MATCH</span>
                  <span>/</span>
                  <span>次の試合</span>
                </div>
                <MatchCard key="upcoming" match={upcomingMatch} isUpcoming />
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function LeagueTablePreview({ clubId, competitions, mainTeamId, clubName, accentColor }: { clubId: string; competitions: Competition[]; mainTeamId?: string | null; clubName: string; accentColor: string }) {
  const selectedCompetition = useMemo(() => competitions.find((c) => c.showOnHome) || competitions[0], [competitions]);
  const [rows, setRows] = useState<Standing[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(selectedCompetition));

  useEffect(() => {
    let cancelled = false;
    if (!selectedCompetition?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    fetch(`/api/public/club/${encodeURIComponent(clubId)}/standings?competitionId=${encodeURIComponent(selectedCompetition.id)}`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("順位表を読み込めませんでした")))
      .then((json) => {
        if (cancelled) return;
        setRows(Array.isArray(json?.standings) ? json.standings : []);
        setError(typeof json?.errorMessage === "string" ? json.errorMessage : "");
      })
      .catch(() => {
        if (!cancelled) setError("順位表を読み込めませんでした");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, selectedCompetition?.id]);

  const visibleRows = useMemo(() => {
    if (rows.length <= 5) return rows;
    const idx = Math.max(0, rows.findIndex((row) => row.id === mainTeamId));
    const teamIndex = idx >= 0 ? idx : 0;
    const size = Math.min(5, rows.length);
    const start = Math.max(0, Math.min(teamIndex - 2, rows.length - size));
    return rows.slice(start, start + size);
  }, [rows, mainTeamId]);

  if (!selectedCompetition) return null;

  return (
    <section>
      {sectionTitle("LEAGUE TABLE", selectedCompetition.name || "順位表", accentColor, `/${clubId}/table`, "順位表をすべて見る")}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">読み込み中</p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-slate-500">{error}</p>
        ) : visibleRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">表示できる順位表がありません</p>
        ) : (
          <table className="w-full table-fixed text-xs">
            <thead className="text-[10px] text-slate-500">
              <tr>
                <th className="w-9 py-2 text-left">順位</th>
                <th className="py-2 text-left">クラブ</th>
                <th className="w-8 py-2 text-right" aria-label="Played">P</th>
                <th className="w-10 py-2 text-right" aria-label="Goal Difference">GD</th>
                <th className="w-10 py-2 text-right" aria-label="Points">PTS</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const isOwn = row.id === mainTeamId || (!mainTeamId && row.teamName === clubName);
                return (
                  <tr key={row.id} className={isOwn ? "font-black" : "font-semibold"} style={isOwn ? { backgroundColor: `${accentColor}16`, boxShadow: `inset 3px 0 0 ${accentColor}` } : undefined}>
                    <td className="rounded-l-lg py-2 pl-2 tabular-nums">{row.rank}</td>
                    <td className="min-w-0 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {logoNode(row.logoUrl, row.teamName, "h-6 w-6")}
                        <span className="truncate">{row.teamName}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{row.played}</td>
                    <td className="py-2 text-right tabular-nums">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                    <td className="rounded-r-lg py-2 pr-2 text-right font-black tabular-nums">{row.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function ClubHomePattern2(props: ClubHomePattern2Props) {
  const accentColor = props.accentColor || "#861B1D";
  const heroSlides = useMemo(() => {
    const list = (props.heroNews || []).slice(0, 3);
    return list.length ? list : [{ id: "fallback", title: props.clubName, imageUrl: props.stadiumPhotoUrl }];
  }, [props.heroNews, props.stadiumPhotoUrl, props.clubName]);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const id = setInterval(() => setSlideIndex((i) => (i + 1) % heroSlides.length), 5000);
    return () => clearInterval(id);
  }, [heroSlides.length]);

  const recent = uniqueRecentMatches(props.recentMatches, props.mainTeamId);
  const nextMatch = props.upcomingMatches[0];
  const latestNews = props.news.slice(0, 3);
  const featuredPlayers = (props.players || []).slice(0, 2);
  const latestVideo = props.videos[0];

  return (
    <div className="bg-[#FAF9F7] font-sans text-neutral-950">
      <section className="relative w-full">
        <div className="relative h-[260px] w-full overflow-hidden bg-neutral-900 lg:h-[440px]">
          {heroSlides.map((slide, i) => {
            const image = slide.imageUrl || props.stadiumPhotoUrl || "";
            const active = i === slideIndex;
            return image ? (
              <Image
                key={slide.id}
                src={image}
                alt={slide.title || props.clubName}
                fill
                priority={i === 0}
                loading={i === 0 ? "eager" : "lazy"}
                sizes="100vw"
                className={`object-cover transition-opacity duration-700 ${active ? "opacity-100" : "opacity-0"}`}
              />
            ) : (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-700 ${active ? "opacity-100" : "opacity-0"}`}
                style={{ backgroundColor: accentColor }}
              />
            );
          })}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-6 left-4 right-4 text-white lg:bottom-10 lg:left-8 lg:right-8">
            <p className="mb-2 text-xs font-black tracking-[0.18em]">{props.foundedYear ? `EST. ${props.foundedYear}` : "CLUB STORY"}</p>
            <h1 className="max-w-2xl font-sans text-3xl font-black leading-none tracking-[-0.04em] lg:text-6xl">{heroSlides[slideIndex]?.title || props.clubName}</h1>
            <p className="mt-3 line-clamp-2 text-xs font-bold text-white/85 lg:text-sm">このクラブの物語を、ここから見る。</p>
          </div>
          {heroSlides.length > 1 && (
            <div className="absolute bottom-4 right-4 z-10 flex gap-2 lg:bottom-6 lg:right-8">
              {heroSlides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`スライド ${i + 1}`}
                  onClick={() => setSlideIndex(i)}
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${i === slideIndex ? "bg-white" : "bg-white/50"}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-8 lg:grid-cols-2 lg:px-6">
        <LatestMatches clubId={props.clubId} matches={recent} upcomingMatch={nextMatch} mainTeamId={props.mainTeamId} accentColor={accentColor} />
        <LeagueTablePreview clubId={props.clubId} competitions={props.competitions} mainTeamId={props.mainTeamId} clubName={props.clubName} accentColor={accentColor} />
      </div>

      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 pb-8 lg:grid-cols-2 lg:px-6">
        {latestNews.length > 0 ? (
          <section>
            {sectionTitle("NEWS", "ニュース", accentColor, `/${props.clubId}/news`)}
            <div className="space-y-3">
              {latestNews.map((item) => (
                <Link key={item.id} href={`/${props.clubId}/news/${item.id}`} className="flex min-h-[92px] gap-3 rounded-xl border border-slate-200 bg-white p-2">
                  <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {item.imageUrl ? <Image src={item.imageUrl} alt={item.title} fill sizes="112px" className="object-cover" /> : logoNode(props.logoUrl || undefined, props.clubName, "h-full w-full")}
                  </div>
                  <div className="min-w-0 py-1">
                    <p className="text-[10px] font-bold text-slate-500">{formatDate((item as any).publishedAt)} <span style={{ color: accentColor }}>{item.category || "クラブ"}</span></p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-black leading-snug">{item.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {featuredPlayers.length > 0 ? (
          <section>
            {sectionTitle("PLAYERS", "選手", accentColor, `/${props.clubId}/players`, "選手を見る")}
            <div className="grid grid-cols-2 gap-3">
              {featuredPlayers.map((player) => (
                <Link key={player.id} href={`/${props.clubId}/players/${player.id}`} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-slate-200">
                  {player.photoUrl ? <Image src={player.photoUrl} alt={player.name || "Player"} fill sizes="50vw" className="object-cover object-top" /> : <div className="flex h-full w-full items-center justify-center bg-slate-200 text-slate-400"><Users className="h-10 w-10" /></div>}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-white">
                    <p className="text-xs font-black">#{player.number || "-"}</p>
                    <p className="line-clamp-2 text-sm font-black">{player.name || "PLAYER"}</p>
                    <p className="text-[10px] font-bold text-white/75">{player.position || ""}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="mx-auto max-w-[1200px] space-y-8 px-4 pb-10 lg:px-6">
        <section className="relative min-h-[240px] overflow-hidden rounded-xl bg-neutral-950 text-white">
          {props.stadiumPhotoUrl ? <Image src={props.stadiumPhotoUrl} alt="Club history" fill sizes="100vw" className="object-cover opacity-70" /> : null}
          <div className="absolute inset-0 bg-black/55" />
          <div className="relative flex min-h-[240px] flex-col justify-end p-5 lg:p-8">
            <h2 className="font-serif text-3xl font-black">CLUB HISTORY</h2>
            <p className="text-xs font-bold text-white/75">クラブ史</p>
            <p className="mt-4 max-w-md text-lg font-black">積み重ねた記録を、クラブの歴史に。</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/${props.clubId}/stats`} className="flex min-h-11 items-center gap-2 rounded-lg bg-white/12 px-4 text-sm font-bold"><BookOpen className="h-4 w-4" /> 選手記録</Link>
              <Link href={`/${props.clubId}/table`} className="flex min-h-11 items-center gap-2 rounded-lg bg-white/12 px-4 text-sm font-bold"><List className="h-4 w-4" /> シーズン記録</Link>
              <Link href={`/${props.clubId}/trophies`} className="flex min-h-11 items-center gap-2 rounded-lg bg-white/12 px-4 text-sm font-bold"><Trophy className="h-4 w-4" /> トロフィールーム</Link>
            </div>
          </div>
        </section>

        {latestVideo ? (
          <section>
            {sectionTitle("CLUB TV", "動画", accentColor, `/${props.clubId}/tv`)}
            <Link href={`/${props.clubId}/tv`} className="block overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="relative aspect-video bg-slate-900">
                <Image src={`https://i.ytimg.com/vi/${latestVideo.youtubeVideoId}/hqdefault.jpg`} alt={latestVideo.title} fill sizes="100vw" className="object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/15"><div className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ backgroundColor: accentColor }}><Play className="ml-1 h-7 w-7 fill-current" /></div></div>
              </div>
              <div className="p-4">
                <h3 className="line-clamp-2 text-lg font-black">{latestVideo.title}</h3>
                {latestVideo.publishedAt ? <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(latestVideo.publishedAt)}</p> : null}
              </div>
            </Link>
          </section>
        ) : null}
      </div>
    </div>
  );
}

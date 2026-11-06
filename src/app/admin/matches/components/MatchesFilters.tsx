"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CompetitionOption, Team } from "../hooks/useMatchesData";

export type MatchesFiltersValue = {
  season: string;
  competitionId: string;
  teamId: string;
};

export function MatchesFilters(props: {
  teams: Team[];
  competitions: CompetitionOption[];
  competitionTeamIds: Map<string, string[]>;
  initialTeamId: string;
  fixedSeason?: string;
  hideSeasonSelect?: boolean;
  /** 先頭に差し込む要素（例: ページ側のシーズン選択を横並びにする） */
  leading?: ReactNode;
  onSearch: (v: MatchesFiltersValue) => void;
  onClear: () => void;
  loading: boolean;
}) {
  const { teams, competitions, competitionTeamIds, initialTeamId, fixedSeason, hideSeasonSelect, leading, onSearch, onClear, loading } = props;

  const [season, setSeason] = useState<string>(typeof fixedSeason === "string" && fixedSeason.trim().length > 0 ? fixedSeason : "all");
  const [competitionId, setCompetitionId] = useState<string>("all");
  const [teamId, setTeamId] = useState<string>("all");

  useEffect(() => {
    if (!hideSeasonSelect) return;
    const next = typeof fixedSeason === "string" && fixedSeason.trim().length > 0 ? fixedSeason : "all";
    if (season !== next) {
      setSeason(next);
      setCompetitionId("all");
      setTeamId("all");
    }
  }, [fixedSeason, hideSeasonSelect, season]);

  useEffect(() => {
    if (teamId !== "all") return;
    if (!initialTeamId || initialTeamId === "all") return;
    const exists = teams.some((t) => t.id === initialTeamId);
    if (exists) setTeamId(initialTeamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTeamId, teams]);

  const seasons = useMemo(() => {
    const ss = Array.from(new Set(competitions.map((c) => c.season).filter((s): s is string => typeof s === "string" && s.length > 0)));
    ss.sort((a, b) => String(b).localeCompare(String(a)));
    return ["all", ...ss];
  }, [competitions]);

  const visibleCompetitions = useMemo(() => {
    if (season === "all") return competitions;
    return competitions.filter((c) => c.season === season);
  }, [competitions, season]);

  const selectedCompetition = useMemo(() =>
    visibleCompetitions.find((c) => c.id === competitionId),
    [visibleCompetitions, competitionId]
  );

  const visibleTeams = useMemo(() => {
    if (competitionId === "all") return teams;
    const ids = competitionTeamIds.get(competitionId) || [];
    const idSet = new Set(ids);
    return teams.filter((t) => idSet.has(t.id));
  }, [teams, competitionTeamIds, competitionId]);

  useEffect(() => {
    if (competitionId === "all") return;
    const ok = visibleCompetitions.some((c) => c.id === competitionId);
    if (!ok) setCompetitionId("all");
  }, [visibleCompetitions, competitionId]);

  useEffect(() => {
    if (teamId === "all") return;
    const ok = visibleTeams.some((t) => t.id === teamId);
    if (!ok) setTeamId("all");
  }, [visibleTeams, teamId]);

  // 濃紺パネル仕様: セレクトは濃紺背景・白文字・細いグレー枠・角丸、高さ40〜44px
  const fieldCls = "h-11 w-full rounded-lg border border-[#4a5b80] bg-[#0d1f4c] px-3 text-[13px] text-white";

  return (
    <div className="rounded-xl border border-[#3d5178] bg-[#13254d] p-3">
      {/* 1段目: シーズン・大会を左右同幅 */}
      <div className="grid grid-cols-2 gap-2.5">
        {leading}
        {!hideSeasonSelect && (
          <Select value={season} onValueChange={setSeason}>
            <SelectTrigger className={fieldCls}>
              <SelectValue placeholder="すべてのシーズン" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "すべてのシーズン" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={competitionId} onValueChange={setCompetitionId}>
          <SelectTrigger className={fieldCls}>
            <span className="flex min-w-0 items-center gap-2 truncate">
              {selectedCompetition ? (
                <>
                  {selectedCompetition.logoUrl && (
                    <Image
                      src={selectedCompetition.logoUrl}
                      alt={selectedCompetition.name}
                      width={20}
                      height={20}
                      className="h-5 w-5 shrink-0 rounded-full object-contain"
                    />
                  )}
                  <span className="truncate">
                    {selectedCompetition.season ? `${selectedCompetition.name} (${selectedCompetition.season})` : selectedCompetition.name}
                  </span>
                </>
              ) : (
                <span className="truncate text-white/70">すべての大会</span>
              )}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての大会</SelectItem>
            {visibleCompetitions.map((comp) => (
              <SelectItem key={comp.id} value={comp.id}>
                <div className="flex min-w-0 items-center gap-2">
                  {comp.logoUrl && (
                    <Image
                      src={comp.logoUrl}
                      alt={comp.name}
                      width={20}
                      height={20}
                      className="h-5 w-5 shrink-0 rounded-full object-contain"
                    />
                  )}
                  <span className="truncate">
                    {comp.season ? `${comp.name} (${comp.season})` : comp.name}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 2段目: チームを横幅いっぱい（ロゴ＋名前＋下矢印はトリガー内） */}
      <div className="mt-2.5">
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className={fieldCls}>
            <SelectValue placeholder="チームを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">チームを選択</SelectItem>
            {visibleTeams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                <div className="flex min-w-0 items-center gap-2">
                  {team.logoUrl && (
                    <Image
                      src={team.logoUrl}
                      alt={team.name}
                      width={20}
                      height={20}
                      className="h-5 w-5 shrink-0 rounded-full object-contain"
                    />
                  )}
                  <span className="truncate">{team.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 3段目: 表示・クリアを左右同幅 */}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={loading}
          onClick={() => onSearch({ season, competitionId, teamId })}
          className="h-11 w-full rounded-lg bg-emerald-500 text-sm font-bold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
        >
          表示
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setSeason(typeof fixedSeason === "string" && fixedSeason.trim().length > 0 ? fixedSeason : "all");
            setCompetitionId("all");
            setTeamId(initialTeamId && teams.some((t) => t.id === initialTeamId) ? initialTeamId : "all");
            onClear();
          }}
          className="h-11 w-full rounded-lg border border-[#8ea2c8] bg-[#0d1f4c] text-sm font-semibold text-white transition-colors hover:bg-[#16305e] disabled:opacity-60"
        >
          クリア
        </button>
      </div>
    </div>
  );
}

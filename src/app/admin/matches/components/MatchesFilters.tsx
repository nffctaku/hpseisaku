"use client";

import { useEffect, useMemo, useState } from "react";
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
  onSearch: (v: MatchesFiltersValue) => void;
  onClear: () => void;
  loading: boolean;
}) {
  const { teams, competitions, competitionTeamIds, initialTeamId, onSearch, onClear, loading } = props;

  const [season, setSeason] = useState<string>("all");
  const [competitionId, setCompetitionId] = useState<string>("all");
  const [teamId, setTeamId] = useState<string>("all");

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

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 sm:gap-4 w-full">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-1">
        <Select value={season} onValueChange={setSeason}>
          <SelectTrigger className="w-full sm:w-[220px] bg-white text-gray-900">
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

        <Select value={competitionId} onValueChange={setCompetitionId}>
          <SelectTrigger className="w-full sm:w-[220px] bg-white text-gray-900">
            <SelectValue placeholder="すべての大会" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての大会</SelectItem>
            {visibleCompetitions.map((comp) => (
              <SelectItem key={comp.id} value={comp.id}>
                {comp.season ? `${comp.name} (${comp.season})` : comp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-full sm:w-[220px] bg-white text-gray-900">
            <SelectValue placeholder="チームを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">チームを選択</SelectItem>
            {visibleTeams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                <div className="flex items-center gap-2">
                  {team.logoUrl && (
                    <Image
                      src={team.logoUrl}
                      alt={team.name}
                      width={20}
                      height={20}
                      className="rounded-full object-contain"
                    />
                  )}
                  <span>{team.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onSearch({ season, competitionId, teamId })}
          className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 px-4 py-2 rounded-md whitespace-nowrap text-center text-sm"
        >
          表示
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setSeason("all");
            setCompetitionId("all");
            setTeamId(initialTeamId && teams.some((t) => t.id === initialTeamId) ? initialTeamId : "all");
            onClear();
          }}
          className="rounded-md border bg-white px-4 py-2 text-sm text-gray-900 shadow-sm hover:bg-gray-50 disabled:opacity-60"
        >
          クリア
        </button>
      </div>
    </div>
  );
}

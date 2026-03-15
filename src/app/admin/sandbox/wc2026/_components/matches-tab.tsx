import type { Match, PredictionsByMatchId } from "./model";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Input } from "@/components/ui/input";
import {
  WC2026_RESULTS_STORAGE_KEY,
  safeParseJson,
  toScoreNumber,
  type ResultsByMatchId,
} from "@/lib/wc2026/results";

function PointsBadge({ label, points }: { label: string; points: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1">
      <span className="text-[11px] font-semibold text-gray-700">{label}</span>
      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
        {points}P
      </span>
    </div>
  );
}

function toPredictionScoreNumber(v: string) {
  if (v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(n)));
}

function stepScore(value: string, delta: number) {
  const next = Math.max(0, Math.min(99, toPredictionScoreNumber(value) + delta));
  return String(next);
}

export function MatchesTab({
  matches,
  matchPredictions,
  setMatchPredictions,
  clampScoreInput,
  resolveTeamAbbrev,
}: {
  matches: Match[];
  matchPredictions: PredictionsByMatchId;
  setMatchPredictions: Dispatch<SetStateAction<PredictionsByMatchId>>;
  clampScoreInput: (v: string) => string;
  resolveTeamAbbrev: (team: Match["home"]) => string;
}) {
  const dateTokenOf = (m: Match) => m.kickoffLabel.split(" ")[0] || "";

  const [officialResults, setOfficialResults] = useState<ResultsByMatchId>({});

  useEffect(() => {
    const load = () => {
      const parsed = safeParseJson<ResultsByMatchId>(localStorage.getItem(WC2026_RESULTS_STORAGE_KEY));
      if (!parsed || typeof parsed !== "object") {
        setOfficialResults({});
        return;
      }
      setOfficialResults(parsed);
    };

    load();

    const onStorage = (e: StorageEvent) => {
      if (e.key !== WC2026_RESULTS_STORAGE_KEY) return;
      load();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const lockedMatchIds = useMemo(() => {
    const locked = new Set<string>();
    for (const m of matches) {
      const r = officialResults[m.id];
      const hs = toScoreNumber(r?.homeScore ?? "");
      const as = toScoreNumber(r?.awayScore ?? "");
      if (hs !== null && as !== null) locked.add(m.id);
    }
    return locked;
  }, [matches, officialResults]);

  const dateTokens = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const m of matches) {
      const token = dateTokenOf(m);
      if (!token) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
    return out;
  }, [matches]);

  const matchesByDateToken = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const token = dateTokenOf(m);
      if (!token) continue;
      const arr = map.get(token) ?? [];
      arr.push(m);
      map.set(token, arr);
    }
    return map;
  }, [matches]);

  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);

  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(0, dateTokens.length - 1));
  const safeActiveDate = dateTokens[safeActiveIndex] ?? "";

  useEffect(() => {
    if (!api) return;

    const onSelect = () => {
      setActiveIndex(api.selectedScrollSnap());
    };

    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    if (dateTokens.length === 0) return;
    const current = api.selectedScrollSnap();
    const clamped = Math.min(Math.max(current, 0), dateTokens.length - 1);
    if (clamped !== current) api.scrollTo(clamped);
  }, [api, dateTokens.length]);

  return (
    <div className="space-y-3">
      <Card className="bg-white text-gray-900">
        <CardHeader>
          <CardTitle className="text-base">ポイントルール</CardTitle>
          <CardDescription>10P単位が目立つバッジ表現（暫定）</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <PointsBadge label="完全的中" points={50} />
          <PointsBadge label="展開的中" points={30} />
          <PointsBadge label="勝敗的中" points={20} />
        </CardContent>
      </Card>

      <Card className="bg-white text-gray-900">
        <CardHeader>
          <CardTitle className="text-base">日付</CardTitle>
          <CardDescription>横スライドで日付を切り替え</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-800">{safeActiveDate || "全日程"}</div>
            <div className="text-xs text-gray-500">
              {dateTokens.length > 0 ? `${safeActiveIndex + 1}/${dateTokens.length}` : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: false }}
        className="w-full"
      >
        <CarouselContent>
          {dateTokens.map((dateToken, dateIdx) => {
            const shouldRender = Math.abs(dateIdx - safeActiveIndex) <= 1;
            const dayMatches = matchesByDateToken.get(dateToken) ?? [];

            return (
              <CarouselItem key={dateToken}>
                {!shouldRender ? (
                  <div className="min-h-[160px]" />
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {dayMatches.map((m) => {
                      const pred = matchPredictions[m.id] || { homeScore: "", awayScore: "", reason: "" };
                      const isLocked = lockedMatchIds.has(m.id);

                      return (
                        <Card key={m.id} className={isLocked ? "bg-gray-100 text-gray-500 opacity-80" : "bg-white text-gray-900"}>
                          <CardHeader>
                            <CardTitle className="text-base">{m.home.name} vs {m.away.name}</CardTitle>
                            <CardDescription>{m.kickoffLabel}</CardDescription>
                            {isLocked ? (
                              <div className="mt-2 text-[11px] font-semibold text-gray-500">結果入力済み（予想不可）</div>
                            ) : null}
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center justify-between gap-1 sm:hidden">
                              <div className="h-6 w-6 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                                {resolveTeamAbbrev(m.home)}
                              </div>

                              <div className="flex items-center gap-1 min-w-0">
                                <div className="inline-flex items-center rounded border bg-white overflow-hidden shrink-0">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-6 w-6 rounded-none px-0 text-xs"
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, homeScore: stepScore(pred.homeScore, -1) },
                                      }));
                                    }}
                                    aria-label="home score -"
                                  >
                                    -
                                  </Button>
                                  <Input
                                    inputMode="numeric"
                                    value={pred.homeScore}
                                    disabled={isLocked}
                                    onChange={(e) => {
                                      if (isLocked) return;
                                      const next = clampScoreInput(e.target.value);
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, homeScore: next },
                                      }));
                                    }}
                                    className="w-7 text-center border-0 rounded-none px-0 text-[11px]"
                                    placeholder="0"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-6 w-6 rounded-none px-0 text-xs"
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, homeScore: stepScore(pred.homeScore, 1) },
                                      }));
                                    }}
                                    aria-label="home score +"
                                  >
                                    +
                                  </Button>
                                </div>

                                <div className="text-[11px] font-bold shrink-0">-</div>

                                <div className="inline-flex items-center rounded border bg-white overflow-hidden shrink-0">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-6 w-6 rounded-none px-0 text-xs"
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, awayScore: stepScore(pred.awayScore, -1) },
                                      }));
                                    }}
                                    aria-label="away score -"
                                  >
                                    -
                                  </Button>
                                  <Input
                                    inputMode="numeric"
                                    value={pred.awayScore}
                                    disabled={isLocked}
                                    onChange={(e) => {
                                      if (isLocked) return;
                                      const next = clampScoreInput(e.target.value);
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, awayScore: next },
                                      }));
                                    }}
                                    className="w-7 text-center border-0 rounded-none px-0 text-[11px]"
                                    placeholder="0"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-6 w-6 rounded-none px-0 text-xs"
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, awayScore: stepScore(pred.awayScore, 1) },
                                      }));
                                    }}
                                    aria-label="away score +"
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>

                              <div className="h-6 w-6 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                                {resolveTeamAbbrev(m.away)}
                              </div>
                            </div>

                            <div className="hidden sm:flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                  {resolveTeamAbbrev(m.home)}
                                </div>
                                <div className="hidden sm:block text-sm font-semibold truncate">{m.home.name}</div>
                              </div>

                              <div className="flex items-center gap-2 justify-center">
                                <div className="inline-flex items-center rounded-md border bg-white overflow-hidden">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-9 w-9 rounded-none px-0"
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, homeScore: stepScore(pred.homeScore, -1) },
                                      }));
                                    }}
                                    aria-label="home score -"
                                  >
                                    -
                                  </Button>
                                  <Input
                                    inputMode="numeric"
                                    value={pred.homeScore}
                                    disabled={isLocked}
                                    onChange={(e) => {
                                      if (isLocked) return;
                                      const next = clampScoreInput(e.target.value);
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, homeScore: next },
                                      }));
                                    }}
                                    className="w-14 text-center border-0 rounded-none px-0"
                                    placeholder="0"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-9 w-9 rounded-none px-0"
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, homeScore: stepScore(pred.homeScore, 1) },
                                      }));
                                    }}
                                    aria-label="home score +"
                                  >
                                    +
                                  </Button>
                                </div>

                                <div className="text-sm font-bold">-</div>

                                <div className="inline-flex items-center rounded-md border bg-white overflow-hidden">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-9 w-9 rounded-none px-0"
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, awayScore: stepScore(pred.awayScore, -1) },
                                      }));
                                    }}
                                    aria-label="away score -"
                                  >
                                    -
                                  </Button>
                                  <Input
                                    inputMode="numeric"
                                    value={pred.awayScore}
                                    disabled={isLocked}
                                    onChange={(e) => {
                                      if (isLocked) return;
                                      const next = clampScoreInput(e.target.value);
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, awayScore: next },
                                      }));
                                    }}
                                    className="w-14 text-center border-0 rounded-none px-0"
                                    placeholder="0"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-9 w-9 rounded-none px-0"
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      setMatchPredictions((prev) => ({
                                        ...prev,
                                        [m.id]: { ...pred, awayScore: stepScore(pred.awayScore, 1) },
                                      }));
                                    }}
                                    aria-label="away score +"
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 min-w-0 justify-end">
                                <div className="hidden sm:block text-sm font-semibold truncate">{m.away.name}</div>
                                <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                  {resolveTeamAbbrev(m.away)}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselPrevious className="-left-2 sm:-left-10" />
        <CarouselNext className="-right-2 sm:-right-10" />
      </Carousel>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SeasonSelect({
  seasons,
  activeSeason,
}: {
  seasons: string[];
  activeSeason: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const pushSeason = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", next);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="w-full sm:w-auto">
      <Select
        value={activeSeason}
        onValueChange={(next) => {
          pushSeason(next);
        }}
      >
        <SelectTrigger className="relative w-full h-8 px-3 pl-8 text-xs rounded-xl bg-background/90 text-foreground border border-border hover:bg-background shadow-sm shadow-black/15 justify-center [&_svg]:absolute [&_svg]:left-3 dark:bg-white/5 dark:text-white dark:border-white/15 dark:hover:bg-white/10 sm:w-[180px] sm:h-9 sm:text-sm">
          <SelectValue placeholder="シーズン" className="w-full justify-center">
            {activeSeason || "シーズン"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {seasons.map((season) => (
            <SelectItem key={season} value={season}>
              {season}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

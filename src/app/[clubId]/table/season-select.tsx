"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SeasonSelect({
  seasons,
  activeSeason,
}: {
  seasons: string[];
  activeSeason: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-muted-foreground" htmlFor="season-select">シーズン</label>
      <select
        id="season-select"
        value={activeSeason}
        onChange={(e) => {
          const next = e.target.value;
          const params = new URLSearchParams(searchParams.toString());
          params.set("season", next);
          router.push(`?${params.toString()}`);
        }}
        className="border rounded-md px-2 py-1 bg-white text-gray-900 text-sm"
      >
        {seasons.map((season) => (
          <option key={season} value={season}>
            {season}
          </option>
        ))}
      </select>
    </div>
  );
}

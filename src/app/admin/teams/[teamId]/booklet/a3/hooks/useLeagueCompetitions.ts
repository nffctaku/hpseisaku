"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function useLeagueCompetitions(
  clubUid: string | null,
  opts?: {
    season?: string | null;
    formats?: Array<"league" | "cup" | "league_cup">;
  }
) {
  const [competitionNames, setCompetitionNames] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!clubUid) {
        setCompetitionNames([]);
        return;
      }
      try {
        const formats =
          Array.isArray(opts?.formats) && opts?.formats.length > 0
            ? opts!.formats
            : (["league", "league_cup"] as const);

        const wheres = [where("format", "in", formats as any)];
        const season = typeof opts?.season === "string" ? opts.season.trim() : "";
        if (season) wheres.push(where("season", "==", season));

        const qRef = query(collection(db, `clubs/${clubUid}/competitions`), ...(wheres as any));
        const snap = await getDocs(qRef);
        const set = new Set<string>();
        for (const d of snap.docs) {
          const data = d.data() as any;
          const name = typeof data?.name === "string" ? String(data.name).trim() : "";
          if (name) set.add(name);
        }
        const list = Array.from(set);
        list.sort((a, b) => a.localeCompare(b, "ja"));
        setCompetitionNames(list);
      } catch (e) {
        console.warn("[useLeagueCompetitions] failed to load competitions", e);
        setCompetitionNames([]);
      }
    };

    void run();
  }, [clubUid, opts?.season, JSON.stringify(opts?.formats ?? null)]);

  return { competitionNames };
}

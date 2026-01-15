"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type LeagueStatRow = {
  season: string;
  league: string;
  rank: string;
};

export function useLeagueStats({
  clubUid,
  teamId,
  leagueCompetitionName,
  seasons,
}: {
  clubUid: string | null;
  teamId: string;
  leagueCompetitionName: string | null;
  seasons: string[];
}) {
  const [leagueStats, setLeagueStats] = useState<LeagueStatRow[]>([]);

  useEffect(() => {
    const run = async () => {
      const name = leagueCompetitionName;
      if (!clubUid || !teamId || !name || seasons.length === 0) {
        setLeagueStats([]);
        return;
      }

      try {
        const compsSnap = await getDocs(
          query(collection(db, `clubs/${clubUid}/competitions`), where("name", "==", name))
        );
        const bySeason = new Map<string, { id: string; name: string; season: string }>();
        for (const d of compsSnap.docs) {
          const data = d.data() as any;
          const s = typeof data?.season === "string" ? String(data.season).trim() : "";
          if (!s || !seasons.includes(s)) continue;
          bySeason.set(s, { id: d.id, name, season: s });
        }

        const rows: LeagueStatRow[] = [];
        for (const s of seasons) {
          const comp = bySeason.get(s);
          if (!comp) {
            rows.push({ season: s, league: name, rank: "-" });
            continue;
          }
          const standingRef = doc(db, `clubs/${clubUid}/competitions/${comp.id}/standings`, teamId);
          const standingSnap = await getDoc(standingRef);
          const st = standingSnap.exists() ? (standingSnap.data() as any) : null;
          const rank = typeof st?.rank === "number" ? String(st.rank) : "-";
          rows.push({ season: s, league: name, rank });
        }
        setLeagueStats(rows);
      } catch (e) {
        console.warn("[useLeagueStats] failed to load league standings", e);
        setLeagueStats([]);
      }
    };

    void run();
  }, [clubUid, teamId, leagueCompetitionName, seasons]);

  return { leagueStats };
}

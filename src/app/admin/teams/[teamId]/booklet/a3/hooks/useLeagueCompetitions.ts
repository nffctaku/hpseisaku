"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function useLeagueCompetitions(
  clubUid: string | null,
  opts?: {
    season?: string | string[] | null;
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

        const set = new Set<string>();

        const expandSeasonVariants = (raw: string): string[] => {
          const s = String(raw || "").trim();
          if (!s) return [];
          const m = s.match(/^(\d{4})([-/])(\d{2}|\d{4})$/);
          if (!m) return [s];
          const start = m[1];
          const end = m[3];
          const end2 = end.length === 4 ? end.slice(-2) : end;
          const end4 = end.length === 2 ? `${start.slice(0, 2)}${end}` : end;
          return [
            `${start}/${end2}`,
            `${start}-${end2}`,
            `${start}/${end4}`,
            `${start}-${end4}`,
          ];
        };

        const seasonCandidates: string[] = (() => {
          const raw = opts?.season;
          if (typeof raw === "string") {
            const s = raw.trim();
            return s ? [s] : [];
          }
          if (Array.isArray(raw)) {
            const out = raw
              .map((x) => (typeof x === "string" ? x.trim() : ""))
              .filter((x) => x.length > 0);
            return Array.from(new Set(out));
          }
          return [];
        })();

        const collectionRef = collection(db, `clubs/${clubUid}/competitions`);

        if (seasonCandidates.length > 0) {
          // NOTE: Firestore側の `season == ...` は完全一致のため、
          // データ側の区切り(/, -)や末尾2桁/4桁、余分な空白で取りこぼしが発生しやすい。
          // そのため season指定時も format in で取得した上で、クライアント側で season を正規化して比較する。
          const targetSeasons = new Set<string>();
          for (const s of seasonCandidates) {
            for (const v of expandSeasonVariants(s)) targetSeasons.add(v);
          }

          const snap = await getDocs(query(collectionRef, where("format", "in", formats as any)));
          for (const d of snap.docs) {
            const data = d.data() as any;
            const seasonRaw = typeof data?.season === "string" ? String(data.season) : "";
            const seasonVariants = expandSeasonVariants(seasonRaw);
            const seasonMatch = seasonVariants.some((v) => targetSeasons.has(v));
            if (!seasonMatch) continue;
            const name = typeof data?.name === "string" ? String(data.name).trim() : "";
            if (name) set.add(name);
          }
        } else {
          const qRef = query(collectionRef, where("format", "in", formats as any));
          const snap = await getDocs(qRef);
          for (const d of snap.docs) {
            const data = d.data() as any;
            const name = typeof data?.name === "string" ? String(data.name).trim() : "";
            if (name) set.add(name);
          }
        }

        const list = Array.from(set);
        list.sort((a, b) => a.localeCompare(b, "ja"));
        setCompetitionNames(list);
      } catch (e) {
        console.warn("[useLeagueCompetitions] failed to load competitions", {
          clubUid,
          season: opts?.season ?? null,
          formats: opts?.formats ?? null,
          error: e,
        });
        setCompetitionNames([]);
      }
    };

    void run();
  }, [clubUid, JSON.stringify(opts?.season ?? null), JSON.stringify(opts?.formats ?? null)]);

  return { competitionNames };
}

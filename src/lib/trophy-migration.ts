import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toSlashSeason } from "@/lib/season";
import { normalizeTitleName, toTrophyTitle, TrophyTitle } from "@/lib/trophies";

export interface LegacyClubTitle {
  competitionName: string;
  seasons: string[];
}

export interface TrophyMigrationResult {
  legacyCount: number;
  created: number;
  seasonsMerged: number;
  skippedEmpty: number;
}

function parseLegacyTitles(raw: unknown): LegacyClubTitle[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t: any) => ({
    competitionName: typeof t?.competitionName === "string" ? t.competitionName : "",
    seasons: Array.isArray(t?.seasons)
      ? (t.seasons as unknown[])
          .map((s) => (typeof s === "string" ? toSlashSeason(s) : ""))
          .filter((s) => s.length > 0)
      : typeof t?.season === "string"
        ? [toSlashSeason(t.season)]
        : [],
  }));
}

/**
 * Lee los títulos legacy `clubTitles` (clubs/{clubUid} primero, club_profiles fallback)
 * — mismo orden de fuente que use-season-records-data.
 */
export async function fetchLegacyClubTitles(clubUid: string): Promise<LegacyClubTitle[]> {
  const clubSnap = await getDoc(doc(db, "clubs", clubUid));
  const clubTitles = clubSnap.exists() ? parseLegacyTitles((clubSnap.data() as any)?.clubTitles) : [];
  if (clubTitles.length > 0) return clubTitles;

  const profileSnap = await getDoc(doc(db, "club_profiles", clubUid));
  return profileSnap.exists() ? parseLegacyTitles((profileSnap.data() as any)?.clubTitles) : [];
}

/**
 * Migra legacy clubTitles → clubs/{clubUid}/trophies. Idempotente:
 * títulos existentes (por normalizedTitleName) solo reciben las seasons que falten.
 * No borra el array legacy (backup).
 */
export async function migrateLegacyClubTitles(opts: {
  clubUid: string;
  careerId: string;
  ownerUid: string;
  clubProfileId?: string;
}): Promise<TrophyMigrationResult> {
  const { clubUid, careerId, ownerUid, clubProfileId } = opts;
  const legacy = await fetchLegacyClubTitles(clubUid);

  const existingSnap = await getDocs(collection(db, `clubs/${clubUid}/trophies`));
  const existingByName = new Map<string, TrophyTitle>();
  for (const d of existingSnap.docs) {
    const t = toTrophyTitle(d.id, d.data() as Record<string, unknown>);
    if (t.careerId === careerId) existingByName.set(t.normalizedTitleName, t);
  }

  // Agrupa legacy por nombre normalizado fusionando seasons (dedupe interno)
  const merged = new Map<string, { name: string; seasons: Set<string> }>();
  let skippedEmpty = 0;
  for (const item of legacy) {
    const name = item.competitionName.trim();
    const normalized = normalizeTitleName(name);
    const seasons = new Set(item.seasons.map((s) => s.trim()).filter(Boolean));
    if (!normalized || seasons.size === 0) {
      skippedEmpty++;
      continue;
    }
    const cur = merged.get(normalized) || { name, seasons: new Set<string>() };
    for (const s of seasons) cur.seasons.add(s);
    merged.set(normalized, cur);
  }

  let created = 0;
  let seasonsMerged = 0;
  for (const [normalized, group] of merged) {
    const existing = existingByName.get(normalized);
    if (existing) {
      const missing = [...group.seasons].filter((s) => !existing.winningSeasons.includes(s));
      if (missing.length > 0) {
        await updateDoc(doc(db, `clubs/${clubUid}/trophies`, existing.id), {
          winningSeasons: arrayUnion(...missing),
          updatedAt: serverTimestamp(),
        });
        seasonsMerged += missing.length;
      }
      continue;
    }
    const ref = doc(collection(db, `clubs/${clubUid}/trophies`));
    await setDoc(ref, {
      ownerUid,
      clubUid,
      clubProfileId: clubProfileId ?? clubUid,
      careerId,
      titleName: group.name,
      normalizedTitleName: normalized,
      trophyImageKey: "gold",
      winningSeasons: [...group.seasons],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    created++;
  }

  return { legacyCount: legacy.length, created, seasonsMerged, skippedEmpty };
}

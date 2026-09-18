import { db } from "@/lib/firebase/admin";
import { normalizeTitleName, TROPHY_IMAGE_PRESETS } from "@/lib/trophies";
import { toSlashSeason } from "@/lib/season";

export interface PublicTrophy {
  id: string;
  titleName: string;
  trophyImageKey: string;
  winningSeasons: string[];
  createdAtMillis: number;
}

/**
 * Lee clubs/{clubUid}/trophies para render público (Admin SDK).
 * Filtra por careerId de los Careers activos del clubUid — los trofeos de
 * Careers borrados o de raíces legacy compartidas no se muestran.
 */
export async function fetchPublicTrophies(clubUid: string): Promise<PublicTrophy[]> {
  try {
    const careerSnap = await db.collection("careers").where("clubUid", "==", clubUid).limit(10).get();
    const careerIds = new Set(
      careerSnap.docs
        .filter((d) => (d.data() as Record<string, unknown>).status !== "deleted")
        .map((d) => d.id)
    );

    const snap = await db.collection(`clubs/${clubUid}/trophies`).get();
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
        return {
          id: d.id,
          careerId: typeof data.careerId === "string" ? data.careerId : "",
          titleName: typeof data.titleName === "string" ? data.titleName : "",
          trophyImageKey: typeof data.trophyImageKey === "string" ? data.trophyImageKey : "",
          winningSeasons: Array.isArray(data.winningSeasons)
            ? (data.winningSeasons as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            : [],
          createdAtMillis: typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : 0,
        };
      })
      .filter((t) => t.titleName.length > 0 && (careerIds.size === 0 || careerIds.has(t.careerId)))
      .sort((a, b) => a.createdAtMillis - b.createdAtMillis || a.id.localeCompare(b.id))
      .map(({ careerId: _careerId, ...rest }) => rest);
  } catch (e) {
    console.error("[trophies-server] public fetch failed", e);
    return [];
  }
}

function parseLegacyTitlesServer(raw: unknown): { competitionName: string; seasons: string[] }[] {
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

async function fetchLegacyClubTitlesServer(clubUid: string): Promise<{ competitionName: string; seasons: string[] }[]> {
  try {
    const clubSnap = await db.collection("clubs").doc(clubUid).get();
    const clubTitles = clubSnap.exists ? parseLegacyTitlesServer((clubSnap.data() as any)?.clubTitles) : [];
    if (clubTitles.length > 0) return clubTitles;

    const profileSnap = await db.collection("club_profiles").doc(clubUid).get();
    return profileSnap.exists ? parseLegacyTitlesServer((profileSnap.data() as any)?.clubTitles) : [];
  } catch (e) {
    console.error("[trophies-server] legacy fetch failed", e);
    return [];
  }
}

/**
 * Títulos para display público: nuevos Trophy primero; si el clubUid no tiene
 * ninguno (usuario no migrado), fallback a legacy clubTitles agrupado por nombre
 * normalizado. Nunca devuelve ambas fuentes a la vez.
 */
export async function fetchDisplayTrophies(clubUid: string): Promise<PublicTrophy[]> {
  const trophies = await fetchPublicTrophies(clubUid);
  if (trophies.length > 0) return trophies;

  const legacy = await fetchLegacyClubTitlesServer(clubUid);
  const grouped = new Map<string, PublicTrophy>();
  let order = 0;
  for (const item of legacy) {
    const name = item.competitionName.trim();
    const normalized = normalizeTitleName(name);
    const seasons = item.seasons.map((s) => s.trim()).filter(Boolean);
    if (!normalized || seasons.length === 0) continue;
    const cur = grouped.get(normalized);
    if (cur) {
      for (const s of seasons) {
        if (!cur.winningSeasons.includes(s)) cur.winningSeasons.push(s);
      }
      continue;
    }
    grouped.set(normalized, {
      id: `legacy-${order++}`,
      titleName: name,
      trophyImageKey: TROPHY_IMAGE_PRESETS[0].key,
      winningSeasons: [...seasons],
      createdAtMillis: order,
    });
  }
  return [...grouped.values()];
}

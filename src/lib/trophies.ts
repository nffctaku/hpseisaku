import type { Timestamp } from "firebase/firestore";

export interface TrophyTitle {
  id: string;
  ownerUid: string;
  clubUid: string;
  clubProfileId?: string;
  careerId: string;
  titleName: string;
  normalizedTitleName: string;
  trophyImageKey: string;
  winningSeasons: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TrophyImagePreset {
  key: string;
  src: string;
  label: string;
}

export const TROPHY_IMAGE_PRESETS: TrophyImagePreset[] = [
  { key: "gold", src: "/trophies/trophy-gold.webp", label: "ゴールド" },
  { key: "silver-ball", src: "/trophies/trophy-silver-ball.webp", label: "シルバー" },
  { key: "cup", src: "/trophies/trophy-cup.webp", label: "カップ" },
  { key: "silver", src: "/trophies/trophy-silver.webp", label: "シルバー2" },
];

export const TROPHY_ROOM_BG = "/trophies/room-bg.webp";

export function trophyImageSrc(imageKey: string | undefined | null): string {
  const preset = TROPHY_IMAGE_PRESETS.find((p) => p.key === imageKey);
  return preset ? preset.src : TROPHY_IMAGE_PRESETS[0].src;
}

export function normalizeTitleName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export const TROPHY_TITLE_MAX_LENGTH = 50;

export function toTrophyTitle(id: string, data: Record<string, unknown>): TrophyTitle {
  return {
    id,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    clubUid: typeof data.clubUid === "string" ? data.clubUid : "",
    clubProfileId: typeof data.clubProfileId === "string" ? data.clubProfileId : undefined,
    careerId: typeof data.careerId === "string" ? data.careerId : "",
    titleName: typeof data.titleName === "string" ? data.titleName : "",
    normalizedTitleName: typeof data.normalizedTitleName === "string" ? data.normalizedTitleName : "",
    trophyImageKey: typeof data.trophyImageKey === "string" ? data.trophyImageKey : "",
    winningSeasons: Array.isArray(data.winningSeasons)
      ? data.winningSeasons.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [],
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  };
}

export function sortSeasonsAsc(seasons: string[]): string[] {
  const start = (s: string) => {
    const m = String(s).match(/^(\d{4})/);
    return m ? Number(m[1]) : 9999;
  };
  return [...seasons].sort((a, b) => start(a) - start(b) || String(a).localeCompare(String(b)));
}

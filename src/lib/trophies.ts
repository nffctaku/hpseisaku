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
  { key: "trophy-1", src: "/trophies/trophy-1.webp", label: "素材1" },
  { key: "trophy-2", src: "/trophies/trophy-2.webp", label: "素材2" },
  { key: "trophy-3", src: "/trophies/trophy-3.webp", label: "素材3" },
  { key: "trophy-4", src: "/trophies/trophy-4.webp", label: "素材4" },
  { key: "trophy-5", src: "/trophies/trophy-5.webp", label: "素材5" },
  { key: "trophy-6", src: "/trophies/trophy-6.webp", label: "素材6" },
  { key: "trophy-7", src: "/trophies/trophy-7.webp", label: "素材7" },
  { key: "trophy-8", src: "/trophies/trophy-8.webp", label: "素材8" },
  { key: "trophy-9", src: "/trophies/trophy-9.webp", label: "素材9" },
  { key: "trophy-10", src: "/trophies/trophy-10.webp", label: "素材10" },
  { key: "trophy-11", src: "/trophies/trophy-11.webp", label: "素材11" },
  { key: "trophy-12", src: "/trophies/trophy-12.webp", label: "素材12" },
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

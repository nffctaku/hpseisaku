import { MAX_BATCH_WRITES } from "./career-constants";

export function pickFields(data: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}

export function assertWithinBatchLimit(
  copyPlayers: boolean,
  copyTeams: boolean,
  copySettings: boolean,
  playerCount: number,
  opponentCount: number,
  extraWriteCount = 0
): void {
  // club_profiles, main team, careers update, users update = 4
  const total = 4 + (copyTeams ? opponentCount : 0) + (copyPlayers ? playerCount : 0) + extraWriteCount;
  if (total > MAX_BATCH_WRITES) {
    throw new Error(
      `コピー対象が Firestore 書き込み上限（${MAX_BATCH_WRITES}件）を超えています。対象を減らしてください。`
    );
  }
}

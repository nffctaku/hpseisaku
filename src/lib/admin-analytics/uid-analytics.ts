import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

export function toDateMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const ts = value as { toMillis?: () => number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function isProPlan(plan: unknown): boolean {
  return typeof plan === 'string' && (plan.toLowerCase() === 'pro' || plan.toLowerCase() === 'officia');
}

export function ownerUidFromPath(path: string): string | null {
  const parts = path.split('/');
  if (parts.length >= 2 && parts[0] === 'clubs') {
    return parts[1];
  }
  return null;
}

export function getClubName(data: Record<string, unknown>): string | null {
  if (isNonEmptyString(data.clubName)) return data.clubName.trim();
  if (isNonEmptyString(data.name)) return data.name.trim();
  if (isNonEmptyString(data.teamName)) return data.teamName.trim();
  const club = data.club as Record<string, unknown> | undefined;
  if (club && isNonEmptyString(club.name)) return club.name.trim();
  const profile = data.profile as Record<string, unknown> | undefined;
  if (profile && isNonEmptyString(profile.clubName)) return profile.clubName.trim();
  return null;
}

export function isDeleted(data: Record<string, unknown>): boolean {
  return data.isDeleted === true || data.deletedAt != null;
}

export function validTeam(data: Record<string, unknown>): boolean {
  return !isDeleted(data) && isNonEmptyString(data.name);
}

export function validPlayer(data: Record<string, unknown>): boolean {
  return !isDeleted(data) && isNonEmptyString(data.name);
}

export function validCompetition(data: Record<string, unknown>): boolean {
  return !isDeleted(data) && (isNonEmptyString(data.name) || isNonEmptyString(data.competitionName));
}

export function validMatch(data: Record<string, unknown>): boolean {
  if (isDeleted(data)) return false;
  return (
    isNonEmptyString(data.homeTeam) ||
    isNonEmptyString(data.awayTeam) ||
    isNonEmptyString(data.matchDate) ||
    data.matchDate !== undefined
  );
}

export function hasTeamImage(data: Record<string, unknown>): boolean {
  return isNonEmptyString(data.logoUrl);
}

export function hasPlayerImage(data: Record<string, unknown>): boolean {
  if (isNonEmptyString(data.photoUrl)) return true;
  if (isNonEmptyString(data.photoURL)) return true;
  const seasonData = data.seasonData && typeof data.seasonData === 'object'
    ? (data.seasonData as Record<string, unknown>)
    : null;
  if (!seasonData) return false;
  for (const value of Object.values(seasonData)) {
    if (value && typeof value === 'object') {
      const sd = value as Record<string, unknown>;
      if (isNonEmptyString(sd.photoUrl)) return true;
      if (isNonEmptyString(sd.photoURL)) return true;
    }
  }
  return false;
}

export interface ProStatus {
  isPaidPro: boolean;
  isGrantedPro: boolean;
  isFree: boolean;
  plan: 'pro' | 'officia' | 'free';
}

export function computeProStatus(
  uid: string,
  options: {
    userSubscription?: { status?: string } | undefined;
    uidHasStripeCustomer?: Record<string, boolean>;
    uidToPlan?: Record<string, boolean>;
  }
): ProStatus {
  const isPaidPro = (options.userSubscription?.status === 'pro') || !!options.uidHasStripeCustomer?.[uid];
  const isGrantedPro = !isPaidPro && !!options.uidToPlan?.[uid];
  const isFree = !isPaidPro && !isGrantedPro;
  const plan: 'pro' | 'officia' | 'free' = isPaidPro ? 'pro' : isGrantedPro ? 'officia' : 'free';
  return { isPaidPro, isGrantedPro, isFree, plan };
}

export function computeActive(lastActivity: number, now: number): { active7: boolean; active30: boolean } {
  const ms7 = 7 * 24 * 60 * 60 * 1000;
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  return {
    active7: lastActivity > now - ms7,
    active30: lastActivity > now - ms30,
  };
}

export interface MatchDiagnostic {
  total: number;
  valid: number;
  friendly: number;
  invalid: number;
}

export function aggregateMatchesByOwner(
  matchesSnap: FirebaseFirestore.QuerySnapshot,
  friendlySnap: FirebaseFirestore.QuerySnapshot | null,
  options?: { includeFriendly?: boolean; diagnostics?: boolean }
): { counts: Record<string, number>; diagnostics?: Record<string, MatchDiagnostic> } {
  const counts: Record<string, number> = {};
  const diagnostics: Record<string, MatchDiagnostic> = {};

  const processDoc = (d: QueryDocumentSnapshot<DocumentData>, isFriendly: boolean) => {
    const data = d.data() as Record<string, unknown>;
    const uid = ownerUidFromPath(d.ref.path) || (typeof data.ownerUid === 'string' ? data.ownerUid : null);
    if (!uid) return;

    const total = (diagnostics[uid]?.total ?? 0) + 1;
    const valid = validMatch(data) ? (diagnostics[uid]?.valid ?? 0) + (isFriendly ? 0 : 1) : (diagnostics[uid]?.valid ?? 0);
    const friendly = isFriendly ? (diagnostics[uid]?.friendly ?? 0) + 1 : (diagnostics[uid]?.friendly ?? 0);
    const invalid = !validMatch(data) ? (diagnostics[uid]?.invalid ?? 0) + 1 : (diagnostics[uid]?.invalid ?? 0);
    diagnostics[uid] = { total, valid, friendly, invalid };

    if (!isFriendly && validMatch(data)) {
      counts[uid] = (counts[uid] || 0) + 1;
    }
  };

  for (const d of matchesSnap.docs) {
    processDoc(d as unknown as QueryDocumentSnapshot<DocumentData>, false);
  }

  if (options?.includeFriendly && friendlySnap) {
    for (const d of friendlySnap.docs) {
      processDoc(d as unknown as QueryDocumentSnapshot<DocumentData>, true);
    }
  }

  return options?.diagnostics ? { counts, diagnostics } : { counts };
}

export function computeTeamImageWithFallback(
  ownTeamImageCount: number,
  tCount: number,
  options: {
    mainTeamId: string | null;
    mainTeamLogoUrl: string | null;
    clubLogoUrl: string | null;
  }
): number {
  let tImage = ownTeamImageCount;
  if (options.mainTeamId && !options.mainTeamLogoUrl && options.clubLogoUrl) {
    tImage += 1;
  } else if (!options.mainTeamId && tCount === 1 && ownTeamImageCount === 0 && options.clubLogoUrl) {
    tImage = 1;
  }
  return tImage;
}

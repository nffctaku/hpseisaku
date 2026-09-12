import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

export function hasValue(data: Record<string, unknown>, key: string): boolean {
  const v = data[key];
  return v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
}

export function toDateMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const ts = value as { toMillis?: () => number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function hasTeamLogo(data: Record<string, unknown>): boolean {
  return typeof data.logoUrl === 'string' && data.logoUrl.trim().length > 0;
}

export interface RankedProfile {
  id: string;
  data: Record<string, unknown>;
  score: number;
  hasClubName: boolean;
  hasClubId: boolean;
  hasMainTeam: boolean;
  isPublic: boolean;
  isSelfReferenced: boolean;
  plan: string;
}

export function scoreRepresentativeProfiles(
  profiles: QueryDocumentSnapshot<DocumentData>[],
  options: {
    dataCountsByClubProfile: Record<string, number>;
    now: number;
  }
): RankedProfile[] {
  return profiles
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      const hasClubName = hasValue(data, 'clubName');
      const hasClubId = hasValue(data, 'clubId');
      const hasMainTeam = hasValue(data, 'mainTeamId');
      const hasLogo = hasValue(data, 'logoUrl') || hasTeamLogo(data);
      const plan = String(data.plan || '').toLowerCase();
      const hasClubProfileId = hasValue(data, 'clubProfileId');
      const isSelfReferenced = typeof data.clubProfileId === 'string' && data.clubProfileId === d.id;
      const updatedAt = toDateMillis(data.updatedAt);
      const lastLogin = toDateMillis(data.lastLoginAt);
      const createdAt = toDateMillis(data.createdAt);
      const dataCount = options.dataCountsByClubProfile[d.id] || 0;
      const isPublic = data.isPublic !== false;

      let score = 0;
      // ユーザーの優先順位（ diagnostics と共有）
      if (isSelfReferenced) score += 1000;         // clubProfileId が自分自身の ID と一致
      if (hasMainTeam) score += 100;               // mainTeamId がある
      if (hasClubName) score += 80;                // clubName がある
      if (hasClubId) score += 60;                  // clubId / public slug がある
      if (hasLogo) score += 40;                    // logo がある
      if (plan === 'pro' || plan === 'officia') score += 30; // plan が pro/officia
      if (hasClubProfileId) score += 20;
      score += Math.min(50, dataCount);            // 紐づくデータ量
      if (isPublic) score += 10;

      const updatedDays = Math.floor((options.now - updatedAt) / 86400000);
      const loginDays = Math.floor((options.now - lastLogin) / 86400000);
      const createdDays = Math.floor((options.now - createdAt) / 86400000);
      score += Math.max(0, 30 - updatedDays);      // updatedAt / createdAt が新しい
      score += Math.max(0, 15 - loginDays);
      score += Math.max(0, 10 - createdDays);

      return {
        id: d.id,
        data,
        score,
        hasClubName,
        hasClubId,
        hasMainTeam,
        isPublic,
        isSelfReferenced,
        plan,
      };
    })
    .sort((a, b) => b.score - a.score);
}

import { toDateMillis, computeActive } from './uid-analytics';

export interface LastActivitySources {
  lastActivityAt: number | null;
  eventAt: number | null;
  userAt: number | null;
  authAt: number | null;
  profileAt: number | null;
  representativeAt: number | null;
  userCreatedAt: number | null;
  profileCreatedAt: number | null;
  profileUpdatedAt: number | null;
}

export interface LastActivityResult {
  lastActivityAt: number | null;
  active7: boolean;
  active30: boolean;
  sources: LastActivitySources;
}

export interface LastActivityInputs {
  userData?: Record<string, unknown>;
  authLastSignInAt?: string | number | Date | null;
  profileDocs: Array<Record<string, unknown>>;
  lastEventAt?: number;
  now: number;
}

function pickPositive(value: unknown): number | null {
  const ms = toDateMillis(value);
  return ms > 0 ? ms : null;
}

export function computeLastActivityForUid({
  userData,
  authLastSignInAt,
  profileDocs,
  lastEventAt,
  now,
}: LastActivityInputs): LastActivityResult {
  const eventAt = lastEventAt && lastEventAt > 0 ? lastEventAt : null;
  const userLoginAt = pickPositive(userData?.lastLoginAt);
  const authAt = pickPositive(authLastSignInAt);
  const userAt = [userLoginAt, authAt].filter((v): v is number => v != null).length > 0
    ? Math.max(...[userLoginAt, authAt].filter((v): v is number => v != null))
    : null;

  const representativeAt =
    profileDocs.length > 0 ? pickPositive(profileDocs[0]?.lastLoginAt) : null;

  const profileAt =
    profileDocs.length > 0
      ? (() => {
          const values = profileDocs
            .map((p) => toDateMillis(p?.lastLoginAt))
            .filter((v) => v > 0);
          return values.length > 0 ? Math.max(...values) : null;
        })()
      : null;

  const lastActivityAtVal = pickPositive(userData?.lastActivityAt);
  const userCreatedAt = pickPositive(userData?.createdAt);

  const profileCreatedAt =
    profileDocs.length > 0
      ? (() => {
          const values = profileDocs
            .map((p) => toDateMillis(p?.createdAt))
            .filter((v) => v > 0);
          return values.length > 0 ? Math.max(...values) : null;
        })()
      : null;

  const profileUpdatedAt =
    profileDocs.length > 0
      ? (() => {
          const values = profileDocs
            .map((p) => toDateMillis(p?.updatedAt))
            .filter((v) => v > 0);
          return values.length > 0 ? Math.max(...values) : null;
        })()
      : null;

  const fallbackValues = [eventAt, userAt, profileAt, userCreatedAt, profileCreatedAt, profileUpdatedAt].filter(
    (v): v is number => v != null
  );
  const fallbackAt = fallbackValues.length > 0 ? Math.max(...fallbackValues) : null;

  const lastActivityAt = lastActivityAtVal ?? fallbackAt;

  const { active7, active30 } =
    lastActivityAt != null ? computeActive(lastActivityAt, now) : { active7: false, active30: false };

  return {
    lastActivityAt,
    active7,
    active30,
    sources: {
      lastActivityAt: lastActivityAtVal,
      eventAt,
      userAt,
      authAt,
      profileAt,
      representativeAt,
      userCreatedAt,
      profileCreatedAt,
      profileUpdatedAt,
    },
  };
}

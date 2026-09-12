"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { ANALYTICS_TRACKING_START_AT } from "@/lib/analytics-constants";

const STORAGE_KEYS = {
  firstSource: "footchron_first_source",
  firstMedium: "footchron_first_medium",
  firstCampaign: "footchron_first_campaign",
  firstReferrer: "footchron_first_referrer",
  sampleViewed: "footchron_sample_viewed",
  signupSource: "footchron_signup_source",
};

export const SAMPLE_CLUB_ID = "0Px6FAwAafT2ssDGa0xz61FJro03";

export type ActivationField =
  | "clubCreatedAt"
  | "firstPlayerCreatedAt"
  | "firstCompetitionCreatedAt"
  | "firstMatchCreatedAt";

export interface AcquisitionSnapshot {
  firstSource: string;
  firstMedium: string | null;
  firstCampaign: string | null;
  firstReferrer: string | null;
  sampleViewed: boolean;
  signupSource: string | null;
}

function getHostname(referrer: string): string | null {
  try {
    return new URL(referrer).hostname;
  } catch {
    return null;
  }
}

export function normalizeFirstSource(raw: string | null, referrer: string | null): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s) return s.toLowerCase();
  const host = referrer ? getHostname(referrer) : null;
  if (host) return host.toLowerCase();
  return "direct";
}

function safeGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v === null || v === "" ? null : v;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function captureAcquisitionFromUrl(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STORAGE_KEYS.firstSource) !== null) return;

  const url = new URL(window.location.href);
  const rawSource = url.searchParams.get("utm_source");
  const rawMedium = url.searchParams.get("utm_medium");
  const rawCampaign = url.searchParams.get("utm_campaign");
  const referrer = document.referrer || null;

  const firstSource = normalizeFirstSource(rawSource, referrer);
  const firstMedium = rawMedium || (referrer ? "referral" : null);
  const firstCampaign = rawCampaign || null;
  const firstReferrer = referrer || null;

  safeSet(STORAGE_KEYS.firstSource, firstSource);
  safeSet(STORAGE_KEYS.firstMedium, firstMedium || "");
  safeSet(STORAGE_KEYS.firstCampaign, firstCampaign || "");
  safeSet(STORAGE_KEYS.firstReferrer, firstReferrer || "");
}

export function getAcquisitionSnapshot(): AcquisitionSnapshot {
  if (typeof window === "undefined") {
    return {
      firstSource: "direct",
      firstMedium: null,
      firstCampaign: null,
      firstReferrer: null,
      sampleViewed: false,
      signupSource: null,
    };
  }
  return {
    firstSource: safeGet(STORAGE_KEYS.firstSource) || "direct",
    firstMedium: safeGet(STORAGE_KEYS.firstMedium),
    firstCampaign: safeGet(STORAGE_KEYS.firstCampaign),
    firstReferrer: safeGet(STORAGE_KEYS.firstReferrer),
    sampleViewed: safeGet(STORAGE_KEYS.sampleViewed) === "1",
    signupSource: safeGet(STORAGE_KEYS.signupSource),
  };
}

export function markSampleViewedInStorage(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STORAGE_KEYS.sampleViewed) === "1") return;
  safeSet(STORAGE_KEYS.sampleViewed, "1");
}

export function setSignupSource(source: string): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STORAGE_KEYS.signupSource)) return;
  safeSet(STORAGE_KEYS.signupSource, source);
}

export async function saveUserAcquisition(uid: string): Promise<void> {
  const snap = getAcquisitionSnapshot();
  const ref = doc(db, "users", uid);
  try {
    await setDoc(
      ref,
      {
        analyticsCohort: "tracked",
        createdAt: serverTimestamp(),
        acquisition: {
          firstSource: snap.firstSource,
          firstMedium: snap.firstMedium,
          firstCampaign: snap.firstCampaign,
          firstReferrer: snap.firstReferrer,
          sampleViewed: snap.sampleViewed,
          signupSource: snap.signupSource,
        },
        activation: {
          clubCreatedAt: null,
          firstPlayerCreatedAt: null,
          firstCompetitionCreatedAt: null,
          firstMatchCreatedAt: null,
        },
        subscription: {
          status: "free",
          startedAt: null,
        },
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("[analytics] saveUserAcquisition failed", e);
  }
}

function resolveCohort(uid: string, stored?: string | null): "tracked" | "pre_tracking" {
  if (stored === "pre_tracking" || stored === "tracked") return stored;
  const currentUser = auth.currentUser;
  if (currentUser && currentUser.uid === uid && currentUser.metadata.creationTime) {
    const createdAt = new Date(currentUser.metadata.creationTime);
    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt < ANALYTICS_TRACKING_START_AT ? "pre_tracking" : "tracked";
    }
  }
  // 安全側に倒して既存ユーザー扱い
  return "pre_tracking";
}

export async function setActivationOnce(
  uid: string,
  field: ActivationField
): Promise<boolean> {
  const ref = doc(db, "users", uid);
  try {
    let didSet = false;
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const data = snap.exists() ? (snap.data() as Record<string, Record<string, unknown>>) : undefined;
      const storedCohort = data?.analyticsCohort as string | undefined;
      const cohort = resolveCohort(uid, storedCohort);

      if (cohort === "pre_tracking") {
        // 既存ユーザーの過去行動を現在時刻で記録しない
        transaction.set(
          ref,
          { analyticsCohort: "pre_tracking" },
          { mergeFields: ["analyticsCohort"] }
        );
        didSet = false;
        return;
      }

      const existing = data?.activation?.[field];
      if (existing) {
        didSet = false;
        return;
      }

      transaction.set(
        ref,
        {
          analyticsCohort: "tracked",
          activation: { [field]: serverTimestamp() },
        },
        { mergeFields: ["analyticsCohort", `activation.${field}`] }
      );
      didSet = true;
    });
    return didSet;
  } catch (e) {
    console.warn(`[analytics] setActivationOnce ${field} failed`, e);
    return false;
  }
}

export async function setSubscriptionPro(uid: string): Promise<boolean> {
  const ref = doc(db, "users", uid);
  try {
    let didSet = false;
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const data = snap.exists() ? (snap.data() as Record<string, Record<string, unknown>>) : undefined;
      const existing = data?.subscription?.status;
      if (existing === "pro") {
        didSet = false;
        return;
      }
      transaction.set(
        ref,
        { subscription: { status: "pro", startedAt: serverTimestamp() } },
        { mergeFields: ["subscription.status", "subscription.startedAt"] }
      );
      didSet = true;
    });
    return didSet;
  } catch (e) {
    console.warn("[analytics] setSubscriptionPro failed", e);
    return false;
  }
}

export async function trackEvent(
  eventName: string,
  userId: string | null,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    await addDoc(collection(db, "analyticsEvents"), {
      eventName,
      userId,
      createdAt: serverTimestamp(),
      properties,
    });
  } catch (e) {
    console.warn("[analytics] trackEvent failed", e);
  }
}

export async function ensureUserDocExists(uid: string): Promise<boolean> {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    return snap.exists();
  } catch (e) {
    console.warn("[analytics] ensureUserDocExists failed", e);
    return false;
  }
}

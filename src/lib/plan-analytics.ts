"use client";

import { trackEvent } from "@/lib/analytics";

export type PlanLimitType = "player_photo" | "competition" | "ocr" | "team_photo" | "team_image";

export interface PlanLimitPayload {
  uid: string;
  limitType: PlanLimitType;
  currentCount: number;
  limit: number;
  plan: string;
  sourcePage: string;
}

export interface PaywallPayload {
  uid: string;
  limitType: PlanLimitType;
  sourcePage: string;
}

export async function logPlanLimitReached(payload: PlanLimitPayload): Promise<void> {
  await trackEvent("plan_limit_reached", payload.uid, {
    ...payload,
    createdAt: Date.now(),
  });
}

export async function logProPaywallView(payload: PaywallPayload): Promise<void> {
  await trackEvent("pro_paywall_view", payload.uid, {
    ...payload,
    createdAt: Date.now(),
  });
}

export async function logProCtaClick(payload: PaywallPayload): Promise<void> {
  await trackEvent("pro_cta_click", payload.uid, {
    ...payload,
    createdAt: Date.now(),
  });
}

export async function logCheckoutStart(payload: { uid: string; sourcePage: string }): Promise<void> {
  await trackEvent("checkout_start", payload.uid, {
    ...payload,
    createdAt: Date.now(),
  });
}

export async function logSubscriptionStart(payload: { uid: string; sourcePage: string }): Promise<void> {
  await trackEvent("subscription_start", payload.uid, {
    ...payload,
    createdAt: Date.now(),
  });
}

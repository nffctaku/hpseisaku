import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db, auth } from "@/lib/firebase/admin";
import { GET } from "./route";

const AUTH_HOST = "127.0.0.1:9099";
const API_KEY = "demo-api-key";

async function getIdToken(email: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "testpass123", returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`signIn failed: ${await res.text()}`);
  const body = (await res.json()) as { idToken?: string };
  if (!body.idToken) throw new Error("idToken missing");
  return body.idToken;
}

function createRequest(token?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/me/plan", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function setupUser(suffix: string) {
  const uid = `plan-${suffix}`;
  const email = `${uid}@example.com`;
  try {
    await auth.createUser({ uid, email, password: "testpass123" });
  } catch {
    // ignore
  }
  return { uid, email };
}

async function callPlan(email: string) {
  const token = await getIdToken(email);
  const res = await GET(createRequest(token));
  return { status: res.status, body: await res.json() };
}

describe("GET /api/me/plan", () => {
  test("returns 401 without token", async () => {
    const res = await GET(createRequest());
    assert.equal(res.status, 401);
  });

  // ケースA: 課金stub（club_profiles/{uid}）に plan=pro + stripeCustomerId、
  // active Career側profileは plan=free → effective plan は pro
  test("billing stub pro + career profile free → pro", async () => {
    const { uid, email } = await setupUser(`a-${Math.random().toString(36).slice(2, 8)}`);
    const clubUid = `club-${Math.random().toString(36).slice(2, 8)}`;
    await db.collection("users").doc(uid).set({
      email,
      subscription: { status: "pro" },
    });
    // webhook が書き込む課金stub（club連携フィールドなし）
    await db.collection("club_profiles").doc(uid).set({
      plan: "pro",
      stripeCustomerId: "cus_test_a",
    });
    // active Career側のprofileはfreeのまま
    await db.collection("club_profiles").doc(clubUid).set({
      ownerUid: uid,
      clubUid,
      clubName: "Test Club",
      plan: "free",
    });
    const { status, body } = await callPlan(email);
    assert.equal(status, 200);
    assert.equal(body.plan, "pro");
    assert.equal(body.source, "paid");
  });

  // ケースB: 全profile free・subscriptionなし → free
  test("all profiles free → free", async () => {
    const { uid, email } = await setupUser(`b-${Math.random().toString(36).slice(2, 8)}`);
    const clubUid = `club-${Math.random().toString(36).slice(2, 8)}`;
    await db.collection("users").doc(uid).set({ email });
    await db.collection("club_profiles").doc(clubUid).set({
      ownerUid: uid,
      clubUid,
      clubName: "Free Club",
      plan: "free",
    });
    const { status, body } = await callPlan(email);
    assert.equal(status, 200);
    assert.equal(body.plan, "free");
    assert.equal(body.source, "none");
  });

  // ケースC相当: ownerにpro stub、どのCareerでもpro（plan判定はowner単位でCareer非依存）
  test("owner-level pro survives regardless of active career profile", async () => {
    const { uid, email } = await setupUser(`c-${Math.random().toString(36).slice(2, 8)}`);
    await db.collection("users").doc(uid).set({
      email,
      subscription: { status: "pro" },
    });
    await db.collection("club_profiles").doc(uid).set({
      plan: "pro",
      stripeCustomerId: "cus_test_c",
    });
    // 2つのfree Career profile
    for (const clubUid of [`club-x-${uid}`, `club-y-${uid}`]) {
      await db.collection("club_profiles").doc(clubUid).set({
        ownerUid: uid,
        clubUid,
        clubName: "Club",
        plan: "free",
      });
    }
    const { status, body } = await callPlan(email);
    assert.equal(status, 200);
    assert.equal(body.plan, "pro");
  });

  // ケースD: 解約後（stripe連携profileがfreeへ更新、subscription.status残存でもfree扱い）
  test("cancelled subscription → free even if users.subscription.status lingers", async () => {
    const { uid, email } = await setupUser(`d-${Math.random().toString(36).slice(2, 8)}`);
    await db.collection("users").doc(uid).set({
      email,
      subscription: { status: "pro" }, // webhookが更新しない残存値
    });
    // stripe連携profileは subscription.deleted webhook で free に戻される
    await db.collection("club_profiles").doc(uid).set({
      plan: "free",
      stripeCustomerId: "cus_test_d",
    });
    const { status, body } = await callPlan(email);
    assert.equal(status, 200);
    assert.equal(body.plan, "free");
  });

  // granted Pro（stripeなし手動付与）→ officia として返る
  test("granted pro without stripe → officia (granted)", async () => {
    const { uid, email } = await setupUser(`e-${Math.random().toString(36).slice(2, 8)}`);
    const clubUid = `club-${Math.random().toString(36).slice(2, 8)}`;
    await db.collection("users").doc(uid).set({ email });
    await db.collection("club_profiles").doc(clubUid).set({
      ownerUid: uid,
      clubUid,
      clubName: "Granted Club",
      plan: "pro",
    });
    const { status, body } = await callPlan(email);
    assert.equal(status, 200);
    assert.equal(body.plan, "officia");
    assert.equal(body.source, "granted");
  });
});

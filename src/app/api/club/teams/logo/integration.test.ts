import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { POST } from "./route";

const now = FieldValue.serverTimestamp;
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

function createRequest(payload: object, token: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/club/teams/logo", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

async function setup(suffix: string) {
  const ownerUid = `logoOwner-${suffix}`;
  const email = `${ownerUid}@example.com`;
  const clubUid = `logoClub-${suffix}`;
  const careerId = `logoCareer-${suffix}`;
  const slug = `logoslug-${suffix}`;
  const mainTeamId = `mainTeam-${suffix}`;
  const otherTeamId = `otherTeam-${suffix}`;

  try {
    await auth.createUser({ uid: ownerUid, email, password: "testpass123" });
  } catch {}

  await db.collection("users").doc(ownerUid).set(
    { activeCareerId: careerId, email, createdAt: now(), updatedAt: now() },
    { merge: true }
  );
  await db.collection("careers").doc(careerId).set({
    ownerId: ownerUid,
    clubUid,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid,
    clubUid,
    clubId: slug,
    slug,
    clubName: "Test Club",
    mainTeamId,
    logoUrl: "https://old.example.com/old.png",
    plan: "free",
    createdAt: now(),
    updatedAt: now(),
  });
  // slug alias doc
  await db.collection("club_profiles").doc(slug).set({
    ownerUid,
    clubUid,
    clubId: slug,
    slug,
    clubName: "Test Club",
    logoUrl: "https://old.example.com/old.png",
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(mainTeamId).set({
    name: "Main Team",
    logoUrl: "https://old.example.com/old.png",
    createdAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(otherTeamId).set({
    name: "Other Team",
    createdAt: now(),
  });

  return { ownerUid, email, clubUid, slug, mainTeamId, otherTeamId };
}

describe("POST /api/club/teams/logo", () => {
  test("メインチームのロゴ更新は club_profiles 本体と slug alias に伝播する", async () => {
    const { email, clubUid, slug, mainTeamId } = await setup("main");
    const token = await getIdToken(email);
    const nextUrl = "https://res.cloudinary.com/x/image/upload/v999/new.png";

    const res = await POST(createRequest({ teamId: mainTeamId, logoUrl: nextUrl }, token));
    assert.equal(res.status, 200);

    const team = (await db.doc(`clubs/${clubUid}/teams/${mainTeamId}`).get()).data() as any;
    assert.equal(team.logoUrl, nextUrl);

    const profile = (await db.doc(`club_profiles/${clubUid}`).get()).data() as any;
    assert.equal(profile.logoUrl, nextUrl, "club_profiles/{clubUid}.logoUrl should sync");

    const alias = (await db.doc(`club_profiles/${slug}`).get()).data() as any;
    assert.equal(alias.logoUrl, nextUrl, "slug alias logoUrl should sync");
  });

  test("メインチーム以外のロゴ更新は club_profiles に波及しない", async () => {
    const { email, clubUid, otherTeamId } = await setup("other");
    const token = await getIdToken(email);
    const nextUrl = "https://res.cloudinary.com/x/image/upload/v999/other.png";

    const res = await POST(createRequest({ teamId: otherTeamId, logoUrl: nextUrl }, token));
    assert.equal(res.status, 200);

    const team = (await db.doc(`clubs/${clubUid}/teams/${otherTeamId}`).get()).data() as any;
    assert.equal(team.logoUrl, nextUrl);

    const profile = (await db.doc(`club_profiles/${clubUid}`).get()).data() as any;
    assert.equal(profile.logoUrl, "https://old.example.com/old.png", "profile must not change");
  });

  test("メインチームのロゴ削除は club_profiles も null にする", async () => {
    const { email, clubUid, slug, mainTeamId } = await setup("clear");
    const token = await getIdToken(email);

    const res = await POST(createRequest({ teamId: mainTeamId, logoUrl: "" }, token));
    assert.equal(res.status, 200);

    const profile = (await db.doc(`club_profiles/${clubUid}`).get()).data() as any;
    assert.equal(profile.logoUrl, null);
    const alias = (await db.doc(`club_profiles/${slug}`).get()).data() as any;
    assert.equal(alias.logoUrl, null);
  });
});

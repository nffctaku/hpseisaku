import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { PATCH, DELETE, POST } from "./route";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";

const now = FieldValue.serverTimestamp;
const API_KEY = "demo-api-key";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

async function createUser(uid: string, plan: "free" | "pro") {
  const email = `${uid}@example.com`;
  await auth.createUser({ uid, email, password: "testpass123" });
  await db.collection("users").doc(uid).set({
    email,
    subscription: { status: plan },
    activeCareerId: null,
    createdAt: now(),
  });
  return email;
}

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

async function createCareer(uid: string, clubId: string, status: "active" | "creating" = "active") {
  const careerId = db.collection("careers").doc().id;
  const clubUid = db.collection("club_profiles").doc().id;
  await db.collection("careers").doc(careerId).set({
    ownerId: uid,
    clubUid,
    name: `Career ${careerId.slice(-4)}`,
    clubName: "Test Club",
    clubLogo: null,
    status,
    clubId,
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid: uid,
    clubUid,
    clubId,
    clubName: "Test Club",
    logoUrl: null,
    createdAt: now(),
    updatedAt: now(),
  });
  return { careerId, clubUid, clubId };
}

async function apiRequest(method: string, email: string, path: string, body?: object): Promise<NextRequest> {
  const token = await getIdToken(email);
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("DELETE /api/careers/[id]", () => {
  test("soft deletes the career and switches active to another", async () => {
    const uid = `del-${Date.now()}`;
    const email = await createUser(uid, "free");
    const a = await createCareer(uid, `del-a-${uid}`);
    const b = await createCareer(uid, `del-b-${uid}`);
    await db.collection("users").doc(uid).update({ activeCareerId: a.careerId });

    const req = await apiRequest("DELETE", email, `/api/careers/${a.careerId}`);
    const res = await DELETE(req, { params: Promise.resolve({ id: a.careerId }) });
    assert.equal(res.status, 200);

    const careerA = await db.collection("careers").doc(a.careerId).get();
    assert.equal(careerA.data()?.status, "deleted");

    const user = await db.collection("users").doc(uid).get();
    assert.equal(user.data()?.activeCareerId, b.careerId);

    const resolved = await resolvePublicClubProfile(a.clubId);
    assert.equal(resolved, null);
  });

  test("rejects deletion of another user's career", async () => {
    const uidA = `a-${Date.now()}`;
    const uidB = `b-${Date.now()}`;
    const [emailA, emailB] = await Promise.all([createUser(uidA, "free"), createUser(uidB, "free")]);
    const target = await createCareer(uidA, `other-${uidA}`);

    const req = await apiRequest("DELETE", emailB, `/api/careers/${target.careerId}`);
    const res = await DELETE(req, { params: Promise.resolve({ id: target.careerId }) });
    assert.equal(res.status, 403);
  });

  test("delete active last sets active to null", async () => {
    const uid = `last-${Date.now()}`;
    const email = await createUser(uid, "free");
    const target = await createCareer(uid, `last-${uid}`);
    await db.collection("users").doc(uid).update({ activeCareerId: target.careerId });

    const req = await apiRequest("DELETE", email, `/api/careers/${target.careerId}`);
    const res = await DELETE(req, { params: Promise.resolve({ id: target.careerId }) });
    assert.equal(res.status, 200);

    const user = await db.collection("users").doc(uid).get();
    assert.equal(user.data()?.activeCareerId, null);
  });
});

describe("POST /api/careers/[id] (restore)", () => {
  test("restores a deleted career", async () => {
    const uid = `res-${Date.now()}`;
    const email = await createUser(uid, "free");
    const target = await createCareer(uid, `res-${uid}`, "active");
    await db.collection("careers").doc(target.careerId).update({ status: "deleted", deletedAt: now() });

    const req = await apiRequest("POST", email, `/api/careers/${target.careerId}`);
    const res = await POST(req, { params: Promise.resolve({ id: target.careerId }) });
    assert.equal(res.status, 200);

    const career = await db.collection("careers").doc(target.careerId).get();
    assert.equal(career.data()?.status, "active");

    const resolved = await resolvePublicClubProfile(`res-${uid}`);
    assert.equal(resolved?.clubUid, target.clubUid);
  });

  test("restore fails when 3 active careers already", async () => {
    const uid = `full-${Date.now()}`;
    const email = await createUser(uid, "free");
    const careers = await Promise.all([
      createCareer(uid, `r1-${uid}`),
      createCareer(uid, `r2-${uid}`),
      createCareer(uid, `r3-${uid}`),
    ]);
    const deleted = await createCareer(uid, `r4-${uid}`);
    await db.collection("careers").doc(deleted.careerId).update({ status: "deleted" });

    const req = await apiRequest("POST", email, `/api/careers/${deleted.careerId}`);
    const res = await POST(req, { params: Promise.resolve({ id: deleted.careerId }) });
    assert.equal(res.status, 500);
  });
});

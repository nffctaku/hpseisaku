import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { DELETE, POST, PATCH } from "./route";
import { POST as createPOST, GET } from "../route";
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

async function createCareer(uid: string, clubId: string, status: "active" | "creating" = "active", overrides?: Record<string, unknown>) {
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
    ...overrides,
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

async function apiRequest(method: string, email: string, path: string, body?: object) {
  const token = await getIdToken(email);
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("deleted career protection", () => {
  test("deleted career is not resolvable publicly", async () => {
    const uid = `pub-${Date.now()}`;
    const email = await createUser(uid, "free");
    const { careerId, clubId } = await createCareer(uid, `pub-${uid}`);
    await db.collection("users").doc(uid).update({ activeCareerId: careerId });

    const before = await resolvePublicClubProfile(clubId);
    assert.equal(before?.clubUid, (await db.collection("careers").doc(careerId).get()).data()?.clubUid);

    const req = await apiRequest("DELETE", email, `/api/careers/${careerId}`);
    const res = await DELETE(req, { params: Promise.resolve({ id: careerId }) });
    assert.equal(res.status, 200);

    const after = await resolvePublicClubProfile(clubId);
    assert.equal(after, null, "deleted career must not be public");
  });

  test("cannot write to a deleted career", async () => {
    const uid = `write-${Date.now()}`;
    const email = await createUser(uid, "free");
    const { careerId } = await createCareer(uid, `write-${uid}`);

    await db.collection("careers").doc(careerId).update({ status: "deleted", deletedAt: now() });

    const req = await apiRequest("PATCH", email, `/api/careers/${careerId}`, { name: "書き換え" });
    const res = await PATCH(req, { params: Promise.resolve({ id: careerId }) });
    assert.equal(res.status, 409);

    const snap = await db.collection("careers").doc(careerId).get();
    assert.equal(snap.data()?.name, `Career ${careerId.slice(-4)}`);
  });

  test("cannot copy from a deleted career", async () => {
    const uid = `copysrc-${Date.now()}`;
    const email = await createUser(uid, "pro");
    const source = await createCareer(uid, `copy-src-${uid}`, "active");
    const target = await createCareer(uid, `copy-tgt-${uid}`, "creating");
    await db.collection("users").doc(uid).update({ activeCareerId: source.careerId });

    // 削除
    const delReq = await apiRequest("DELETE", email, `/api/careers/${source.careerId}`);
    const delRes = await DELETE(delReq, { params: Promise.resolve({ id: source.careerId }) });
    assert.equal(delRes.status, 200);

    // 作成 API 経由で削除済み source からコピーしようとする
    const createReq = await apiRequest("POST", email, "/api/careers", {
      recordName: "新記録",
      clubName: "新クラブ",
      clubId: `copy-new-${uid}`,
      copyOptions: {
        sourceCareerId: source.careerId,
        copyPlayers: false,
        copyTeams: false,
        copySettings: false,
      },
    });
    const createRes = await createPOST(createReq);
    assert.equal(createRes.status, 500, "copy from deleted source should fail");

    const targetSnap = await db.collection("careers").doc(target.careerId).get();
    assert.equal(targetSnap.data()?.status, "creating", "target must remain creating on failed copy");

    const sourceSnap = await db.collection("careers").doc(source.careerId).get();
    assert.equal(sourceSnap.data()?.status, "deleted", "source must stay deleted");
  });

  test("deleting last career does not auto-resurrect on list fetch", async () => {
    const uid = `lastlist-${Date.now()}`;
    const email = await createUser(uid, "free");
    const { careerId } = await createCareer(uid, `lastlist-${uid}`);
    await db.collection("users").doc(uid).update({ activeCareerId: careerId });

    const delReq = await apiRequest("DELETE", email, `/api/careers/${careerId}`);
    const delRes = await DELETE(delReq, { params: Promise.resolve({ id: careerId }) });
    assert.equal(delRes.status, 200);

    const listReq = await apiRequest("GET", email, "/api/careers");
    const listRes = await GET(listReq);
    assert.equal(listRes.status, 200);
    const body = (await listRes.json()) as { careers: { id: string; status: string }[] };
    assert.ok(!body.careers.some((c) => c.id === careerId && c.status !== "deleted"));
    assert.equal(body.careers.filter((c) => c.id === careerId).length, 0);
  });

  test("deletion frees slot and restore respects 3 limit", async () => {
    const uid = `limit-${Date.now()}`;
    const email = await createUser(uid, "free");
    const c1 = await createCareer(uid, `lim1-${uid}`);
    const c2 = await createCareer(uid, `lim2-${uid}`);
    const c3 = await createCareer(uid, `lim3-${uid}`);
    const deleted = await createCareer(uid, `lim4-${uid}`);

    // 3件 active、1件 deleted
    await db.collection("careers").doc(deleted.careerId).update({ status: "deleted", deletedAt: now() });
    await db.collection("users").doc(uid).update({ activeCareerId: c1.careerId });

    // 削除で 1枠空く
    const delReq = await apiRequest("DELETE", email, `/api/careers/${c3.careerId}`);
    const delRes = await DELETE(delReq, { params: Promise.resolve({ id: c3.careerId }) });
    assert.equal(delRes.status, 200);

    // 新規作成が 1件できる
    const newReq = await apiRequest("POST", email, "/api/careers", {
      recordName: "新記録",
      clubName: "新クラブ",
      clubId: `new-slot-${uid}`,
    });
    const newRes = await createPOST(newReq);
    assert.equal(newRes.status, 200);

    // 現在 active は c1, c2, new = 3件。deleted を復元しようとすると制限
    const restoreReq = await apiRequest("POST", email, `/api/careers/${deleted.careerId}`);
    const restoreRes = await POST(restoreReq, { params: Promise.resolve({ id: deleted.careerId }) });
    assert.equal(restoreRes.status, 500, "restore over 3 active should fail");
    const body = (await restoreRes.json()) as { message: string };
    assert.match(body.message, /上限/);

    // 復元上限を外す: c2 を削除してから復元
    const del2Req = await apiRequest("DELETE", email, `/api/careers/${c2.careerId}`);
    const del2Res = await DELETE(del2Req, { params: Promise.resolve({ id: c2.careerId }) });
    assert.equal(del2Res.status, 200);

    const restore2Req = await apiRequest("POST", email, `/api/careers/${deleted.careerId}`);
    const restore2Res = await POST(restore2Req, { params: Promise.resolve({ id: deleted.careerId }) });
    assert.equal(restore2Res.status, 200, "restore should succeed when under limit");
  });

  test("deleting one user's career does not affect another user", async () => {
    const uidA = `a-${Date.now()}`;
    const uidB = `b-${Date.now()}`;
    const [emailA, emailB] = await Promise.all([createUser(uidA, "free"), createUser(uidB, "free")]);
    const a = await createCareer(uidA, `other-a-${uidA}`);
    const b = await createCareer(uidB, `other-b-${uidB}`);
    await db.collection("users").doc(uidA).update({ activeCareerId: a.careerId });
    await db.collection("users").doc(uidB).update({ activeCareerId: b.careerId });

    const delReq = await apiRequest("DELETE", emailA, `/api/careers/${a.careerId}`);
    const delRes = await DELETE(delReq, { params: Promise.resolve({ id: a.careerId }) });
    assert.equal(delRes.status, 200);

    const bSnap = await db.collection("careers").doc(b.careerId).get();
    assert.equal(bSnap.data()?.status, "active", "other user's career must remain active");

    const bPublic = await resolvePublicClubProfile(b.clubId);
    assert.equal(bPublic?.clubUid, bSnap.data()?.clubUid, "other user's public profile must remain");
  });
});

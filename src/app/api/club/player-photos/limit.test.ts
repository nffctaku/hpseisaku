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

function createRequest(token: string, payload: object): NextRequest {
  return new NextRequest("http://localhost:3000/api/club/player-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// uid, career, club, team をseed。existingPhotoCount 人の画像持ち選手と、
// 画像なし対象選手 targetPlayerId を1人作る。
async function setupClub(plan: "free" | "pro", existingPhotoCount: number) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const uid = `photo-limit-${suffix}`;
  const email = `${uid}@example.com`;
  const careerId = `career-${suffix}`;
  const clubUid = `club-${suffix}`;
  const teamId = `team-${suffix}`;
  const playerId = `player-${suffix}`;

  try {
    await auth.createUser({ uid, email, password: "testpass123" });
  } catch {
    // ignore
  }
  await db.collection("users").doc(uid).set({
    email,
    activeCareerId: careerId,
    subscription: { status: plan },
    createdAt: now(),
  });
  await db.collection("careers").doc(careerId).set({
    ownerId: uid,
    clubUid,
    name: "テスト",
    clubName: "テスト",
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid: uid,
    clubUid,
    clubName: "テスト",
    plan: "free",
    createdAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(teamId).set({
    name: "チーム",
    clubUid,
    createdAt: now(),
  });

  for (let i = 0; i < existingPhotoCount; i++) {
    await db.collection(`clubs/${clubUid}/teams/${teamId}/players`).doc(`p${i}`).set({
      name: `選手${i}`,
      photoUrl: `https://example.com/p${i}.png`,
      createdAt: now(),
    });
  }
  await db.collection(`clubs/${clubUid}/teams/${teamId}/players`).doc(playerId).set({
    name: "対象選手",
    seasons: ["2025-26"],
    createdAt: now(),
  });

  return { uid, email, clubUid, teamId, playerId };
}

async function getPlayerPhotoFields(clubUid: string, teamId: string, playerId: string) {
  const snap = await db
    .collection(`clubs/${clubUid}/teams/${teamId}/players`)
    .doc(playerId)
    .get();
  const data = (snap.data() || {}) as Record<string, any>;
  const seasonPhoto =
    typeof data?.seasonData?.["2025-26"]?.photoUrl === "string"
      ? data.seasonData["2025-26"].photoUrl
      : null;
  return { photoUrl: data.photoUrl ?? null, seasonPhoto };
}

describe("POST /api/club/player-photos limit", () => {
  test("Free: 19人→20人目の画像登録は成功", async () => {
    const c = await setupClub("free", 19);
    const token = await getIdToken(c.email);
    const res = await POST(
      createRequest(token, {
        teamId: c.teamId,
        season: "2025-26",
        playerId: c.playerId,
        photoUrl: "https://example.com/new.png",
      })
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
    const fields = await getPlayerPhotoFields(c.clubUid, c.teamId, c.playerId);
    assert.equal(fields.photoUrl, "https://example.com/new.png");
    assert.equal(fields.seasonPhoto, "https://example.com/new.png");
  });

  test("Free: 20人到達後の21人目は403かつphotoUrlがFirestoreに残らない", async () => {
    const c = await setupClub("free", 20);
    const token = await getIdToken(c.email);
    const res = await POST(
      createRequest(token, {
        teamId: c.teamId,
        season: "2025-26",
        playerId: c.playerId,
        photoUrl: "https://example.com/over.png",
      })
    );
    assert.equal(res.status, 403);
    const fields = await getPlayerPhotoFields(c.clubUid, c.teamId, c.playerId);
    assert.equal(fields.photoUrl, null, "top-level photoUrl should not be written");
    assert.equal(fields.seasonPhoto, null, "seasonData photoUrl should not be written");
  });

  test("Free(legacy): 51人規模の超過保持でも新規追加のみ拒否・既存画像は保持", async () => {
    const c = await setupClub("free", 21);
    const token = await getIdToken(c.email);
    const res = await POST(
      createRequest(token, {
        teamId: c.teamId,
        season: "2025-26",
        playerId: c.playerId,
        photoUrl: "https://example.com/legacy-over.png",
      })
    );
    assert.equal(res.status, 403);
    // 既存21件はそのまま
    const snap = await db.collection(`clubs/${c.clubUid}/teams/${c.teamId}/players`).get();
    const withPhoto = snap.docs.filter(
      (d) => typeof d.data().photoUrl === "string" && d.data().photoUrl.trim()
    ).length;
    assert.equal(withPhoto, 21);
  });

  test("Pro: 20人超でも登録可能", async () => {
    const c = await setupClub("pro", 20);
    const token = await getIdToken(c.email);
    const res = await POST(
      createRequest(token, {
        teamId: c.teamId,
        season: "2025-26",
        playerId: c.playerId,
        photoUrl: "https://example.com/pro.png",
      })
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });
});

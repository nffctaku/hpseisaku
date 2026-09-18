// 解約時のPro権限残留チェック (demo-footchron エミュレータ)
// getEffectivePlanForUid の判定マトリクス:
//   課金中 / 解約済み(stale subscription.status) / 手動付与 / 解約後の手動付与 等
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_EMULATOR_PROJECT_ID = "demo-footchron";

const { db } = await import("@/lib/firebase/admin");
const { getEffectivePlanForUid } = await import("@/lib/server-plan");
const { getPlanLimit } = await import("@/lib/plan-limits");

const ts = Date.now();
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`, JSON.stringify(extra)); }
};

async function setup(tag: string, opts: {
  user?: Record<string, unknown>;
  profile?: Record<string, unknown> | null;
}) {
  const uid = `u-cx-${tag}-${ts}`;
  await db.collection("users").doc(uid).set({ email: `${uid}@t`, ...opts.user });
  if (opts.profile !== null) {
    await db.collection("club_profiles").doc(uid).set({ ownerUid: uid, ...(opts.profile || {}) });
  }
  return uid;
}

// ── 1. 課金中（通常パターン）──────────────────────────
{
  const uid = await setup("paid", {
    user: { subscription: { status: "pro" } },
    profile: { plan: "pro", stripeCustomerId: "cus_paid1" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("課金中 → pro/paid", p.plan === "pro" && p.isPaid && !p.isGranted, p);
}

// ── 2. 課金中だが users.subscription.status 未設定 ─────
{
  const uid = await setup("paid2", {
    user: {},
    profile: { plan: "pro", stripeCustomerId: "cus_paid2" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("課金中(subscription.status無し) → pro/paid", p.plan === "pro" && p.isPaid, p);
}

// ── 3. 解約済み: profile plan='free' + cid + stale sub.status='pro' ──
{
  const uid = await setup("canceled", {
    user: { subscription: { status: "pro" } },            // 残存するstale値
    profile: { plan: "free", stripeCustomerId: "cus_cx" } // webhookが解約時にfreeへ
  });
  const p = await getEffectivePlanForUid(uid);
  check("解約済み → free（stale sub.status を無視）", p.plan === "free" && !p.isPaid && !p.isGranted, p);
}

// ── 4. 解約済み + 手動付与(users.plan='pro') → 付与は有効 ──
{
  const uid = await setup("cx+grant", {
    user: { subscription: { status: "pro" }, plan: "pro" },
    profile: { plan: "free", stripeCustomerId: "cus_cx2" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("解約後も手動付与は有効 → granted", p.plan === "officia" && p.isGranted, p);
}

// ── 5. 手動付与のみ(profile plan='pro', cid無し) ──────
{
  const uid = await setup("grant", {
    user: { subscription: { status: "free" } },
    profile: { plan: "pro" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("手動付与(profile) → granted", p.plan === "officia" && p.isGranted, p);
}

// ── 6. 手動付与のみ(users.plan='pro') ─────────────────
{
  const uid = await setup("grantU", {
    user: { plan: "pro" },
    profile: { plan: "free" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("手動付与(users.plan) → granted", p.plan === "officia" && p.isGranted, p);
}

// ── 7. 完全Free ─────────────────────────────────────
{
  const uid = await setup("free", {
    user: { subscription: { status: "free" } },
    profile: { plan: "free" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("Free → free", p.plan === "free", p);
}

// ── 8. subscription.status='pro'のみ（Stripe連携なし=test/手動付与系）──
{
  const uid = await setup("subonly", {
    user: { subscription: { status: "pro" } },
    profile: { plan: "free" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("Stripe連携無しのsub.status=pro → pro維持（既存挙動）", p.plan === "pro" && p.isPaid, p);
}

// ── 9. users.stripeCustomerId のみ存在 + stale sub.status → 解約扱い ──
{
  const uid = await setup("cx-usr", {
    user: { subscription: { status: "pro" }, stripeCustomerId: "cus_cx3" },
    profile: { plan: "free" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("users.cid有り+profile非Pro → free", p.plan === "free", p);
}

// ── 10. officia課金中 ────────────────────────────────
{
  const uid = await setup("officia", {
    user: { subscription: { status: "pro" } },
    profile: { plan: "officia", stripeCustomerId: "cus_off" },
  });
  const p = await getEffectivePlanForUid(uid);
  check("officia課金 → pro/paid", p.plan === "pro" && p.isPaid, p);
}

// ── 選手画像リミット整合 ────────────────────────────
{
  const proTier = (await getEffectivePlanForUid(await setup("l1", { user: { subscription: { status: "pro" } }, profile: { plan: "pro", stripeCustomerId: "c1" } }))).tier;
  const freeTier = (await getEffectivePlanForUid(await setup("l2", { user: {}, profile: { plan: "free" } }))).tier;
  check("Pro: player_photos 無制限", !Number.isFinite(getPlanLimit("player_photos_per_team", proTier)));
  check("Free: player_photos 20", getPlanLimit("player_photos_per_team", freeTier) === 20);
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

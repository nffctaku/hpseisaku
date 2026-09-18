// 「Already subscribed.」調査（本番・読み取り専用）
// 1) メール→Auth UID  2) Firestore plan/stripeCustomerId  3) Stripe顧客・契約の照合
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { db, auth } = await import("@/lib/firebase/admin");

const EMAIL = "yellow.sea155@gmail.com";
const SK = process.env.STRIPE_SECRET_KEY!;
if (!SK) throw new Error("STRIPE_SECRET_KEY not set");

const stripeGet = async (path: string) => {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${SK}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`stripe ${path} → ${res.status}: ${JSON.stringify(j)}`);
  return j;
};

const show = (label: string, v: any) =>
  console.log(`${label}:`, typeof v === "object" ? JSON.stringify(v) : v);

async function main() {
  // 1. Auth: email → uid
  let uid = "";
  try {
    const u = await auth.getUserByEmail(EMAIL);
    uid = u.uid;
    show("auth.uid", uid);
    show("auth.email", u.email);
    show("auth.created", u.metadata.creationTime);
    show("auth.lastSignIn", u.metadata.lastSignInTime);
  } catch (e: any) {
    console.log("auth.getUserByEmail FAILED:", e.message);
    // users コレクションから email で検索
    const snap = await db.collection("users").where("email", "==", EMAIL).limit(5).get();
    console.log("users by email:", snap.docs.map((d) => d.id));
    if (!snap.empty) uid = snap.docs[0].id;
  }
  if (!uid) { console.log("uid特定不可"); return; }

  // 2. Firestore 側
  const userDoc = await db.collection("users").doc(uid).get();
  const ud = userDoc.data() || {};
  show("users.plan", ud.plan);
  show("users.subscription", ud.subscription);
  show("users.stripeCustomerId", ud.stripeCustomerId);
  show("users.activeCareerId", ud.activeCareerId);

  const profDoc = await db.collection("club_profiles").doc(uid).get();
  const pd = profDoc.exists ? profDoc.data()! : null;
  show("club_profiles/{uid}.exists", profDoc.exists);
  if (pd) {
    show("  .plan", pd.plan);
    show("  .stripeCustomerId", pd.stripeCustomerId);
    show("  .clubUid", pd.clubUid);
    show("  .ownerUid", pd.ownerUid);
    show("  .updatedAt", pd.updatedAt?.toDate?.());
  }

  // ownerUid で引く（doc id≠uid の場合に備えて）
  const profByOwner = await db.collection("club_profiles").where("ownerUid", "==", uid).limit(10).get();
  console.log("club_profiles by ownerUid:", profByOwner.docs.map((d) => `${d.id}(plan=${d.data()?.plan}, cust=${d.data()?.stripeCustomerId})`));

  // careers → clubUid ごとのプロフィールも見る
  const careers = await db.collection("careers").where("ownerId", "==", uid).limit(20).get();
  for (const c of careers.docs) {
    const cd = c.data();
    const cp = await db.collection("club_profiles").doc(cd.clubUid).get();
    const cpd = cp.exists ? cp.data()! : {};
    console.log(`career ${c.id} clubUid=${cd.clubUid} status=${cd.status} → profile(plan=${cpd.plan}, cust=${cpd.stripeCustomerId})`);
  }

  // チェックアウトsessionキャッシュ
  const cs = await db.collection("stripe_checkout_sessions").doc(uid).get();
  show("stripe_checkout_sessions/{uid}", cs.exists ? cs.data() : "none");

  // 3. Stripe側: FirestoreのstripeCustomerId → 顧客・契約
  const custIds = new Set<string>();
  if (pd?.stripeCustomerId) custIds.add(pd.stripeCustomerId);
  for (const d of profByOwner.docs) { const c = d.data()?.stripeCustomerId; if (c) custIds.add(c); }
  if (ud.stripeCustomerId) custIds.add(ud.stripeCustomerId);

  for (const cid of custIds) {
    try {
      const cust = await stripeGet(`/v1/customers/${cid}`);
      console.log(`\n=== Stripe customer ${cid} ===`);
      show("  email", cust.email);
      show("  metadata", cust.metadata);
      show("  deleted", cust.deleted ?? false);
      const subs = await stripeGet(`/v1/subscriptions?customer=${cid}&status=all&limit=10`);
      for (const s of subs.data) {
        console.log(`  sub ${s.id}: status=${s.status} created=${new Date(s.created * 1000).toISOString()} cancel_at_period_end=${s.cancel_at_period_end} ended=${s.ended_at ? new Date(s.ended_at * 1000).toISOString() : "-"}`);
        show("    items", s.items?.data?.map((i: any) => `${i.price?.id}(${i.price?.nickname || i.price?.product})`));
        show("    metadata", s.metadata);
      }
      if (!subs.data.length) console.log("  (subscriptions: none)");
      const sessions = await stripeGet(`/v1/checkout/sessions?customer=${cid}&limit=10`);
      for (const s of sessions.data) {
        console.log(`  session ${s.id}: status=${s.status} mode=${s.mode} ref=${s.client_reference_id} created=${new Date(s.created * 1000).toISOString()}`);
      }
    } catch (e: any) {
      console.log(`  customer ${cid} fetch error: ${e.message}`);
    }
  }

  // メールでStripe顧客も検索（紐付け漏れ・重複顧客の確認）
  const byEmail = await stripeGet(`/v1/customers?email=${encodeURIComponent(EMAIL)}&limit=10`);
  console.log(`\n=== Stripe customers by email (${byEmail.data.length}) ===`);
  for (const c of byEmail.data) {
    console.log(`  ${c.id}: email=${c.email} metadata=${JSON.stringify(c.metadata)}`);
    if (!custIds.has(c.id)) {
      const subs = await stripeGet(`/v1/subscriptions?customer=${c.id}&status=all&limit=10`);
      for (const s of subs.data) {
        console.log(`    sub ${s.id}: status=${s.status} ref/none metadata=${JSON.stringify(s.metadata)}`);
      }
      const sessions = await stripeGet(`/v1/checkout/sessions?customer=${c.id}&limit=10`);
      for (const s of sessions.data) {
        console.log(`    session ${s.id}: status=${s.status} ref=${s.client_reference_id}`);
      }
    }
  }

  // 同一stripeCustomerIdを持つ他プロフィール（紐付け不整合の確認）
  for (const cid of custIds) {
    const shared = await db.collection("club_profiles").where("stripeCustomerId", "==", cid).limit(10).get();
    if (shared.docs.length > 1) {
      console.log(`!! customer ${cid} shared by profiles: ${shared.docs.map((d) => `${d.id}(owner=${d.data()?.ownerUid},plan=${d.data()?.plan})`)}`);
    }
  }
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

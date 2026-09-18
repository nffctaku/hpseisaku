// 本番・読み取り専用: lemon.7017.250@gmail.com のUID/Career/clubUid/Pro判定を調査
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { db, auth } = await import("@/lib/firebase/admin");
const { getEffectivePlanForUid } = await import("@/lib/server-plan");
const { getActiveClubUid } = await import("@/lib/career-server");

const EMAIL = "lemon.7017.250@gmail.com";
const show = (l: string, v: any) => console.log(`${l}:`, typeof v === "object" ? JSON.stringify(v) : v);

const u = await auth.getUserByEmail(EMAIL);
const uid = u.uid;
show("auth.uid", uid);
show("auth.email", u.email);
show("auth.created", u.metadata.creationTime);

const userDoc = await db.collection("users").doc(uid).get();
const ud = (userDoc.data() || {}) as any;
show("users.plan", ud.plan);
show("users.subscription", ud.subscription);
show("users.stripeCustomerId", ud.stripeCustomerId);
show("users.activeCareerId", ud.activeCareerId);

// Career一覧
const careersSnap = await db.collection("careers").where("ownerId", "==", uid).get();
console.log(`\ncareers (${careersSnap.size}件):`);
for (const c of careersSnap.docs) {
  const cd = c.data() as any;
  const active = c.id === ud.activeCareerId ? " ← ACTIVE" : "";
  console.log(`  careerId=${c.id} clubUid=${cd.clubUid} name=${cd.name ?? cd.clubName} clubId=${cd.clubId}${active}`);
}

// プロフィール群
const ownProf = await db.collection("club_profiles").doc(uid).get();
show("\nclub_profiles/{uid}.exists", ownProf.exists);
if (ownProf.exists) { const p = ownProf.data() as any; show("  .plan", p.plan); show("  .stripeCustomerId", p.stripeCustomerId); }
const owned = await db.collection("club_profiles").where("ownerUid", "==", uid).get();
for (const d of owned.docs) {
  const p = d.data() as any;
  console.log(`  club_profiles/${d.id}: plan=${p.plan} cid=${p.stripeCustomerId ?? "-"} clubId=${p.clubId ?? "-"}`);
}

// Pro判定（uidベース＝修正後 / clubUidベース＝旧バグパス）
const eff = await getEffectivePlanForUid(uid);
console.log("\ngetEffectivePlanForUid(uid):", JSON.stringify(eff));
const activeClubUid = await getActiveClubUid(uid);
show("activeClubUid", activeClubUid);
const byClub = await getEffectivePlanForUid(activeClubUid);
console.log("getEffectivePlanForUid(activeClubUid) [旧バグパス]:", JSON.stringify(byClub));

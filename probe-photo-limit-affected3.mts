// 本番・読み取り専用(第3弾): 誤判定の表示影響範囲を計測。
// Pro/officia 判定される全uidについて、activeCareer.clubUid ≠ uid のものを列挙
// = check API が clubUid で plan を引き Free 表示になっていたユーザー。
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { db } = await import("@/lib/firebase/admin");

async function main() {
  // plan が pro/officia の club_profiles を全件取得
  const profs = await db.collection("club_profiles").get();
  const uidSet = new Set<string>();
  for (const d of profs.docs) {
    const p = d.data() as any;
    const plan = typeof p?.plan === "string" ? p.plan.toLowerCase() : "";
    if (plan !== "pro" && plan !== "officia" && plan !== "tm") continue;
    // doc id=uid のプロフィール or ownerUid 経由
    uidSet.add(d.id);
    if (typeof p.ownerUid === "string" && p.ownerUid) uidSet.add(p.ownerUid);
  }
  // users.subscription.status='pro' も拾う
  const usersSnap = await db.collection("users").get();
  for (const d of usersSnap.docs) {
    const u = d.data() as any;
    if (u?.subscription?.status === "pro" || u?.plan === "pro") uidSet.add(d.id);
  }

  console.log(`Pro系uid候補: ${uidSet.size}`);
  let affected = 0, same = 0, noCareer = 0;
  for (const uid of uidSet) {
    const uDoc = await db.collection("users").doc(uid).get();
    const careerId = uDoc.exists ? uDoc.data()?.activeCareerId : null;
    if (!careerId) { noCareer++; continue; }
    const cDoc = await db.collection("careers").doc(careerId).get();
    const clubUid = cDoc.exists ? cDoc.data()?.clubUid : null;
    if (!clubUid) { noCareer++; continue; }
    if (clubUid === uid) same++;
    else {
      affected++;
      const profDoc = await db.collection("club_profiles").doc(clubUid).get();
      console.log(`  [表示誤判定] uid=${uid.slice(0,14)}… activeClubUid=${clubUid.slice(0,14)}… careerProfile.plan=${profDoc.exists ? profDoc.data()?.plan : "doc無し"}`);
    }
  }
  console.log(`\n非デフォルトCareer上のPro(=Free表示になっていた): ${affected}`);
  console.log(`デフォルトCareer(clubUid=uid)のPro(正常): ${same} / Career未設定: ${noCareer}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

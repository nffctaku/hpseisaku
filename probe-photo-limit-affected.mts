// 本番・読み取り専用: 選手画像20枚制限の誤判定の影響範囲を特定する。
// 1) analyticsEvents の plan_limit_reached(limitType=player_photo) を発火したuidを列挙
// 2) 各uidについて getEffectivePlanForUid(uid)（修正後の正しい判定）と
//    getEffectivePlanForUid(activeClubUid)（旧バグパス）を比較
// 3) ProなのにFree判定だったアカウントを特定（課金/手動付与の区別付き）
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { db } = await import("@/lib/firebase/admin");
const { getEffectivePlanForUid } = await import("@/lib/server-plan");
const { getActiveClubUid } = await import("@/lib/career-server");

async function main() {
  // 直近の plan_limit_reached(player_photo) イベントを収集
  const snap = await db
    .collection("analyticsEvents")
    .where("eventName", "==", "plan_limit_reached")
    .limit(500)
    .get();

  const hits = new Map<string, { count: number; lastPlan?: string; source?: string }>();
  for (const d of snap.docs) {
    const e = d.data() as any;
    const props = e?.properties || {};
    if (props.limitType !== "player_photo") continue;
    const uid = typeof e.userId === "string" ? e.userId : props.uid;
    if (!uid) continue;
    const cur = hits.get(uid) || { count: 0 };
    cur.count += 1;
    cur.lastPlan = props.plan;
    cur.source = props.sourcePage;
    hits.set(uid, cur);
  }

  console.log(`plan_limit_reached(player_photo) 発火uid数: ${hits.size}`);
  let affected = 0;
  for (const [id, meta] of hits) {
    // 旧コードは userId に clubUid を書いていた可能性があるため、
    // uid としても clubUid としても両方試す
    const asUid = await getEffectivePlanForUid(id).catch(() => null);
    const clubUid = await getActiveClubUid(id).catch(() => null);
    const byClub = clubUid ? await getEffectivePlanForUid(clubUid).catch(() => null) : null;

    const userDoc = await db.collection("users").doc(id).get();
    const ud = userDoc.exists ? (userDoc.data() as any) : {};
    const careerDoc = ud.activeCareerId
      ? await db.collection("careers").doc(ud.activeCareerId).get()
      : null;
    const careerClubUid = careerDoc?.exists ? careerDoc.data()?.clubUid : null;

    const trulyPro = asUid && (asUid.plan === "pro" || asUid.plan === "officia");
    const misjudged = trulyPro && byClub && byClub.plan === "free" && clubUid !== id;

    if (misjudged) affected++;
    console.log(
      `${misjudged ? "[誤判定]" : "       "} id=${id.slice(0, 12)}… hits=${meta.count}` +
      ` uid判定=${asUid?.plan ?? "?"}(${asUid?.isPaid ? "paid" : asUid?.isGranted ? "granted" : "-"})` +
      ` clubUid判定=${byClub?.plan ?? "?"} clubUid≠uid:${clubUid !== id}` +
      ` activeCareer.clubUid=${String(careerClubUid).slice(0, 12)}…`
    );
  }
  console.log(`\nProなのにFree表示だった可能性のあるアカウント: ${affected} / ${hits.size}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

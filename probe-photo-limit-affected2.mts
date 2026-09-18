// 本番・読み取り専用(第2弾): 旧コードは plan_limit_reached の userId に clubUid を書いていた。
// ヒットした id が users ではなく club_profiles/clubUid の場合、ownerUid を辿って
// 実ユーザーの effective plan を確認し、Pro誤判定アカウントを特定する。
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { db } = await import("@/lib/firebase/admin");
const { getEffectivePlanForUid } = await import("@/lib/server-plan");

async function main() {
  const snap = await db
    .collection("analyticsEvents")
    .where("eventName", "==", "plan_limit_reached")
    .limit(1000)
    .get();

  const ids = new Set<string>();
  for (const d of snap.docs) {
    const e = d.data() as any;
    const props = e?.properties || {};
    if (props.limitType !== "player_photo") continue;
    const id = typeof e.userId === "string" ? e.userId : props.uid;
    if (id) ids.add(id);
  }
  console.log(`対象id数: ${ids.size}`);

  let affected = 0;
  for (const id of ids) {
    const userDoc = await db.collection("users").doc(id).get();
    const isUser = userDoc.exists;

    // id が clubUid の可能性 → club_profiles/{id}.ownerUid を辿る
    const profDoc = await db.collection("club_profiles").doc(id).get();
    const prof = profDoc.exists ? (profDoc.data() as any) : null;
    const ownerUid = typeof prof?.ownerUid === "string" ? prof.ownerUid : null;

    const effId = await getEffectivePlanForUid(id).catch(() => null);
    let realUid = id;
    let realEff = effId;
    if (!isUser && ownerUid && ownerUid !== id) {
      realUid = ownerUid;
      realEff = await getEffectivePlanForUid(ownerUid).catch(() => null);
    }

    const isPro = realEff && (realEff.plan === "pro" || realEff.plan === "officia");
    if (isPro) affected++;
    console.log(
      `${isPro ? "[PRO誤判定]" : "           "} id=${id.slice(0, 14)}…` +
      ` users.doc=${isUser}` +
      ` ${!isUser && ownerUid ? `→owner=${ownerUid.slice(0, 14)}…` : ""}` +
      ` 実plan=${realEff?.plan ?? "?"}(${realEff?.isPaid ? "paid" : realEff?.isGranted ? "granted" : "-"})` +
      ` users.plan=${(userDoc.data() as any)?.plan ?? "-"} sub=${(userDoc.data() as any)?.subscription?.status ?? "-"}`
    );
  }
  console.log(`\nProなのに20枚制限に当たったアカウント: ${affected} / ${ids.size}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

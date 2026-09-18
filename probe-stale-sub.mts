import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { db } = await import("@/lib/firebase/admin");
const usersSnap = await db.collection("users").get();
const profs = await db.collection("club_profiles").get();
const profsByOwner = new Map<string, any[]>();
for (const d of profs.docs) {
  const p = d.data() as any;
  const owner = typeof p?.ownerUid === "string" ? p.ownerUid : d.id;
  const arr = profsByOwner.get(owner) || [];
  arr.push({ id: d.id, plan: p?.plan, cid: p?.stripeCustomerId });
  profsByOwner.set(owner, arr);
}
let stale = 0, active = 0;
for (const u of usersSnap.docs) {
  const ud = u.data() as any;
  if (ud?.subscription?.status !== "pro") continue;
  const mine = [...(profsByOwner.get(u.id) || [])];
  const own = profs.docs.find(d => d.id === u.id);
  if (own && !mine.some(x => x.id === own.id)) mine.push({ id: own.id, plan: (own.data() as any)?.plan, cid: (own.data() as any)?.stripeCustomerId });
  const stripeProfs = mine.filter(x => typeof x.cid === "string" && x.cid);
  const hasStripe = stripeProfs.length > 0 || typeof ud.stripeCustomerId === "string";
  const paid = stripeProfs.some(x => ["pro","officia","tm"].includes(String(x.plan).toLowerCase()));
  if (paid || !hasStripe) { active++; }
  else { stale++; console.log(`[stale] uid=${u.id} sub.status=pro profiles=${JSON.stringify(mine.map(m=>({id:m.id.slice(0,8),plan:m.plan})))}`); }
}
console.log(`sub.status=pro 総数: ${active+stale} / 有効Pro: ${active} / 解約済みstale: ${stale}`);

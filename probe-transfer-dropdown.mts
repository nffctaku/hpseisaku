// 指定チームの移籍プルダウン候補を 旧/新ロジックで比較（読み取りのみ・本番Firestore）
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { db } = await import("@/lib/firebase/admin");

const OWNER_UID = "uGZypGTf0mSh5JHqy3XlErH60CZ2";
const TEAM_ID = process.env.TEAM_ID || "hWgb3g5LcFhXflyi7TYK";
const SEASON = process.env.SEASON || "2025/26";

const toSlash = (s: string) => s.replace(/-/g, "/");
const toDash = (s: string) => s.replace(/\//g, "-");

function oldPick(p: any, seasons: string[]): string | null {
  const ps = Array.isArray(p.seasons) ? p.seasons : [];
  const normalized = ps.map((s: string) => toSlash(s));
  for (const s of seasons) if (normalized.includes(s)) return s;
  return null;
}

function newPick(p: any, seasons: string[]): string | null {
  const ps = Array.isArray(p.seasons) ? p.seasons : null;
  const sd = p.seasonData && typeof p.seasonData === "object" ? p.seasonData : null;
  for (const s of seasons) {
    const dash = toDash(s);
    if (ps && ps.some((x: string) => toDash(x) === dash)) return s;
    if (sd && (sd[s] || sd[dash])) return s;
  }
  if (!ps || ps.length === 0) return seasons[0];
  return null;
}

async function main() {
  const userSnap = await db.collection("users").doc(OWNER_UID).get();
  const activeCareerId = userSnap.data()?.activeCareerId;
  let clubUid = OWNER_UID;
  if (activeCareerId) {
    const c = await db.collection("careers").doc(activeCareerId).get();
    clubUid = c.data()?.clubUid || OWNER_UID;
    console.log("[career]", { activeCareerId, clubUid, name: c.data()?.name });
  }

  const snap = await db.collection(`clubs/${clubUid}/teams/${TEAM_ID}/players`).get();
  console.log(`[players] clubs/${clubUid}/teams/${TEAM_ID}/players = ${snap.size}件`);

  const m = SEASON.match(/^(\d{4})\/(\d{2})$/);
  const prev = m ? `${Number(m[1]) - 1}/${String((Number(m[2]) - 1 + 100) % 100).padStart(2, "0")}` : null;

  for (const direction of ["in", "out"] as const) {
    const targetSeasons = direction === "out" && prev ? [SEASON, prev] : [SEASON];
    const oldList: string[] = [];
    const newList: string[] = [];
    for (const d of snap.docs) {
      const p = d.data() as any;
      if (oldPick(p, targetSeasons)) oldList.push(`${d.id}:${p.name}`);
      if (newPick(p, targetSeasons)) newList.push(`${d.id}:${p.name}`);
    }
    const oldSet = new Set(oldList);
    const added = newList.filter((x) => !oldSet.has(x));
    console.log(`\n=== ${direction.toUpperCase()} 候補 ===`);
    console.log(`旧: ${oldList.length}件 / 新: ${newList.length}件`);
    added.forEach((x) => console.log("  追加表示 +", x));
    console.log("新候補:", newList.map((x) => x.split(":").slice(1).join(":")));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

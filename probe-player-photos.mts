// 実データの選手画像状態を調査（読み取りのみ・本番Firestore）
import { db } from "@/lib/firebase/admin";

const OWNER_UID = process.env.TARGET_UID || "uGZypGTf0mSh5JHqy3XlErH60CZ2";

async function main() {
  const userSnap = await db.collection("users").doc(OWNER_UID).get();
  const activeCareerId = userSnap.data()?.activeCareerId;
  let clubUid = OWNER_UID;
  if (activeCareerId) {
    const c = await db.collection("careers").doc(activeCareerId).get();
    clubUid = c.data()?.clubUid || OWNER_UID;
    console.log("[career]", { activeCareerId, clubUid, name: c.data()?.name, status: c.data()?.status });
  } else {
    console.log("[career] activeCareerId なし → clubUid=uid");
  }

  const teamsSnap = await db.collection(`clubs/${clubUid}/teams`).get();
  console.log(`[teams] ${teamsSnap.size}件`);
  for (const t of teamsSnap.docs) {
    const teamId = t.id;
    const playersSnap = await db.collection(`clubs/${clubUid}/teams/${teamId}/players`).get();
    console.log(`\n=== team ${teamId} (${t.data()?.name}) players=${playersSnap.size} ===`);
    for (const p of playersSnap.docs) {
      const d = p.data() as any;
      const sdKeys = Object.keys(d.seasonData || {});
      const sdPhotos = sdKeys.filter((k) => d.seasonData?.[k]?.photoUrl).map((k) => `${k}:${String(d.seasonData[k].photoUrl).slice(-40)}`);
      if (d.photoUrl || sdPhotos.length > 0) {
        console.log(JSON.stringify({
          id: p.id,
          name: d.name,
          seasons: d.seasons,
          photoUrl: d.photoUrl ? `...${String(d.photoUrl).slice(-50)}` : null,
          seasonDataPhotos: sdPhotos,
        }));
      }
    }
  }

  const seasonsSnap = await db.collection(`clubs/${clubUid}/seasons`).get();
  for (const s of seasonsSnap.docs) {
    const rosterSnap = await db.collection(`clubs/${clubUid}/seasons/${s.id}/roster`).get();
    if (rosterSnap.empty) continue;
    console.log(`\n=== roster ${s.id} (${rosterSnap.size}件) ===`);
    for (const r of rosterSnap.docs) {
      const d = r.data() as any;
      const sdKeys = Object.keys(d.seasonData || {});
      const sdPhoto = sdKeys.filter((k) => d.seasonData?.[k]?.photoUrl);
      if (d.photoUrl || sdPhoto.length > 0) {
        console.log(JSON.stringify({
          id: r.id,
          name: d.name,
          photoUrl: d.photoUrl ? `...${String(d.photoUrl).slice(-50)}` : null,
          seasonPhotoKeys: sdPhoto,
        }));
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

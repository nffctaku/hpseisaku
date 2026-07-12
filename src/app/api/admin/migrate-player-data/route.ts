import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { toSlashSeason } from "@/lib/season";

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const idToken = authHeader.substring(7, authHeader.length);
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      return decodedToken.uid;
    } catch (e) {
      console.error("Failed to verify ID token:", e);
      return null;
    }
  }
  return null;
}

// 既存の age から dateOfBirth を計算する関数
function calculateDateOfBirthFromAge(age: number): string {
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - age;
  // シーズン基準日として8月1日を使用
  return `${birthYear}-08-01`;
}

// 既存の tenureYears から joinedSeason を計算する関数
function calculateJoinedSeasonFromTenureYears(tenureYears: number): string {
  const currentYear = new Date().getFullYear();
  const joinedYear = currentYear - tenureYears;
  // シーズン形式に変換 (例: 2025/26)
  const nextYear = (joinedYear + 1).toString().slice(-2);
  return `${joinedYear}/${nextYear}`;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);
    if (!uid) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    // 管理者権限チェック（必要に応じて実装）
    // const userProfile = await getUserProfile(authUser.uid);
    // if (!userProfile?.isAdmin) {
    //   return NextResponse.json({ message: "管理者権限が必要です" }, { status: 403 });
    // }

    let migratedCount = 0;

    // すべてのクラブの選手データを取得
    const clubsSnap = await db.collection("clubs").get();
    
    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id;
      
      // チームを取得
      const teamsSnap = await db.collection(`clubs/${clubId}/teams`).get();
      
      for (const teamDoc of teamsSnap.docs) {
        const teamId = teamDoc.id;
        
        // 選手を取得
        const playersSnap = await db.collection(`clubs/${clubId}/teams/${teamId}/players`).get();
        
        for (const playerDoc of playersSnap.docs) {
          const playerData = playerDoc.data();
          const playerId = playerDoc.id;
          
          const updates: Record<string, any> = {};
          
          // age から dateOfBirth を計算して設定
          if (typeof playerData?.age === "number" && !playerData?.dateOfBirth) {
            updates.dateOfBirth = calculateDateOfBirthFromAge(playerData.age);
            // age フィールドは削除
            updates.age = null;
          }
          
          // tenureYears から joinedSeason を計算して設定
          if (typeof playerData?.tenureYears === "number" && !playerData?.joinedSeason) {
            updates.joinedSeason = calculateJoinedSeasonFromTenureYears(playerData.tenureYears);
            // tenureYears フィールドは削除
            updates.tenureYears = null;
          }
          
          // seasonData 内の age と tenureYears も移行
          if (playerData?.seasonData && typeof playerData.seasonData === "object") {
            const seasonData = playerData.seasonData as Record<string, any>;
            for (const seasonKey in seasonData) {
              const seasonEntry = seasonData[seasonKey];
              if (seasonEntry) {
                const seasonUpdates: Record<string, any> = {};
                
                if (typeof seasonEntry?.age === "number" && !seasonEntry?.dateOfBirth) {
                  seasonUpdates.dateOfBirth = calculateDateOfBirthFromAge(seasonEntry.age);
                  seasonUpdates.age = null;
                }
                
                if (typeof seasonEntry?.tenureYears === "number" && !seasonEntry?.joinedSeason) {
                  seasonUpdates.joinedSeason = calculateJoinedSeasonFromTenureYears(seasonEntry.tenureYears);
                  seasonUpdates.tenureYears = null;
                }
                
                if (Object.keys(seasonUpdates).length > 0) {
                  updates[`seasonData.${seasonKey}`] = seasonUpdates;
                }
              }
            }
          }
          
          if (Object.keys(updates).length > 0) {
            await playerDoc.ref.update(updates);
            migratedCount++;
          }
        }
      }
    }

    return NextResponse.json({
      message: "移行が完了しました",
      migratedCount,
    });
  } catch (e: any) {
    console.error("Migration failed:", e);
    return NextResponse.json(
      { message: e.message || "移行に失敗しました" },
      { status: 500 }
    );
  }
}

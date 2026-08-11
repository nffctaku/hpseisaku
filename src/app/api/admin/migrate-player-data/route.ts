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

// 配列形式のシーズンデータをオブジェクト形式に変換する関数
function convertArraySeasonDataToObject(arrayData: any[]): Record<string, any> {
  if (!Array.isArray(arrayData)) return arrayData;
  return {
    number: arrayData[0],
    subName: arrayData[1],
    position: arrayData[2],
    mainPosition: arrayData[3],
    subPositions: arrayData[4],
    nationality: arrayData[5],
    dateOfBirth: arrayData[6],
    joinedSeason: arrayData[7],
    tenureYears: arrayData[8],
    height: arrayData[9],
    weight: arrayData[10],
    profile: arrayData[11],
    preferredFoot: arrayData[12],
  };
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);
    if (!uid) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    let migratedCount = 0;
    
    // 全クラブを取得
    const clubsSnap = await db.collection("clubs").get();
    
    console.log(`[Migration] Processing ${clubsSnap.docs.length} clubs`);
    
    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id;
      console.log(`[Migration] Processing club: ${clubId}`);
      
      try {
        // クラブ内の全チームを取得
        const teamsSnap = await db.collection(`clubs/${clubId}/teams`).get();
        
        for (const teamDoc of teamsSnap.docs) {
          const teamId = teamDoc.id;
          
          // 選手を取得
          const playersSnap = await db.collection(`clubs/${clubId}/teams/${teamId}/players`).get();
          
          console.log(`[Migration] Processing ${playersSnap.docs.length} players in team ${teamId}`);
          
          for (const playerDoc of playersSnap.docs) {
            const playerData = playerDoc.data();
            const playerId = playerDoc.id;
            
            console.log("[Migration] checking player", {
              playerId,
              hasSeasonData: !!playerData?.seasonData,
              seasonDataKeys: playerData?.seasonData ? Object.keys(playerData.seasonData) : []
            });
            
            const updates: Record<string, any> = {};
            
            // age から dateOfBirth を計算して設定
            if (typeof playerData?.age === "number" && !playerData?.dateOfBirth) {
              updates.dateOfBirth = calculateDateOfBirthFromAge(playerData.age);
              updates.age = null;
            }
            
            // tenureYears から joinedSeason を計算して設定
            if (typeof playerData?.tenureYears === "number" && !playerData?.joinedSeason) {
              updates.joinedSeason = calculateJoinedSeasonFromTenureYears(playerData.tenureYears);
              updates.tenureYears = null;
            }
            
            // seasonData 内の配列をオブジェクトに変換
            if (playerData?.seasonData && typeof playerData.seasonData === "object") {
              const seasonData = playerData.seasonData as Record<string, any>;
              for (const seasonKey in seasonData) {
                const seasonEntry = seasonData[seasonKey];
                if (seasonEntry) {
                  const seasonUpdates: Record<string, any> = {};
                  
                  // 配列形式の場合はオブジェクトに変換
                  if (Array.isArray(seasonEntry)) {
                    console.log("[Migration] converting array to object", {
                      playerId,
                      seasonKey,
                      isArray: Array.isArray(seasonEntry)
                    });
                    seasonUpdates[`seasonData.${seasonKey}`] = convertArraySeasonDataToObject(seasonEntry);
                    migratedCount++;
                    continue;
                  }
                  
                  // オブジェクト形式でも、weight/heightがない場合は補完
                  if (typeof seasonEntry === 'object' && !Array.isArray(seasonEntry)) {
                    const converted = convertArraySeasonDataToObject(seasonEntry as any);
                    if (converted.weight && !seasonEntry.weight) {
                      seasonUpdates.weight = converted.weight;
                    }
                    if (converted.height && !seasonEntry.height) {
                      seasonUpdates.height = converted.height;
                    }
                    if (Object.keys(seasonUpdates).length > 0) {
                      updates[`seasonData.${seasonKey}`] = { ...seasonEntry, ...seasonUpdates };
                      migratedCount++;
                    }
                  }
                  
                  if (typeof seasonEntry?.age === "number" && !seasonEntry?.dateOfBirth) {
                    seasonUpdates.dateOfBirth = calculateDateOfBirthFromAge(seasonEntry.age);
                    seasonUpdates.age = null;
                  }
                  
                  if (typeof seasonEntry?.tenureYears === "number" && !seasonEntry?.joinedSeason) {
                    seasonUpdates.joinedSeason = calculateJoinedSeasonFromTenureYears(seasonEntry.tenureYears);
                    seasonUpdates.tenureYears = null;
                  }
                  
                  if (Object.keys(seasonUpdates).length > 0) {
                    updates[`seasonData.${seasonKey}`] = { ...seasonEntry, ...seasonUpdates };
                  }
                }
              }
            }
            
            if (Object.keys(updates).length > 0) {
              await playerDoc.ref.update(updates);
            }
          }
        }
      } catch (clubError) {
        console.error(`[Migration] Error processing club ${clubId}:`, clubError);
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

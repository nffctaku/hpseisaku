import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

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

    const body = await req.json();
    const { playerId, clubId, teamId } = body;

    if (!playerId || !clubId || !teamId) {
      return NextResponse.json({ message: "playerId, clubId, teamId が必要です" }, { status: 400 });
    }

    // プレイヤーデータを取得
    const playerDocRef = db.collection(`clubs/${clubId}/teams/${teamId}/players`).doc(playerId);
    const playerDocSnap = await playerDocRef.get();

    if (!playerDocSnap.exists) {
      return NextResponse.json({ message: "選手が見つかりません" }, { status: 404 });
    }

    const playerData = playerDocSnap.data();
    console.log("[FixPlayerData] current data", {
      playerId,
      hasSeasonData: !!playerData?.seasonData,
      seasonDataKeys: playerData?.seasonData ? Object.keys(playerData.seasonData) : []
    });

    const updates: Record<string, any> = {};

    // シーズンデータが配列の場合、オブジェクトに変換
    if (playerData?.seasonData && typeof playerData.seasonData === "object") {
      Object.keys(playerData.seasonData).forEach(key => {
        const value = playerData.seasonData[key];
        if (Array.isArray(value)) {
          console.log("[FixPlayerData] converting array to object", { seasonKey: key });
          updates[`seasonData.${key}`] = convertArraySeasonDataToObject(value);
        }
      });
    }

    if (Object.keys(updates).length > 0) {
      await playerDocRef.update(updates);
      return NextResponse.json({
        message: "データを修正しました",
        updatedKeys: Object.keys(updates)
      });
    } else {
      return NextResponse.json({
        message: "修正が必要な配列データは見つかりませんでした"
      });
    }
  } catch (e: any) {
    console.error("Fix player data failed:", e);
    return NextResponse.json(
      { message: e.message || "修正に失敗しました" },
      { status: 500 }
    );
  }
}

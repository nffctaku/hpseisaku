import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";

export const runtime = "nodejs";

async function resolveOwnerUid(clubId: string): Promise<string | null> {
  try {
    // clubId -> 正規 clubUid は共通 resolver に統一（ownerUid 直参照は旧Careerを指すため不可）
    const resolved = await resolvePublicClubProfile(clubId);
    return resolved?.ownerUid ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params;
    if (!clubId) {
      return NextResponse.json({ enabled: false }, { status: 400 });
    }

    const ownerUid = await resolveOwnerUid(clubId);
    if (!ownerUid) {
      return NextResponse.json({ enabled: false }, { status: 404 });
    }

    const partnersRef = db
      .collection(`clubs/${ownerUid}/partners`)
      .where("isPublished", "==", true)
      .limit(1);

    const snap = await partnersRef.get();

    return NextResponse.json({ enabled: !snap.empty });
  } catch (error) {
    console.error("[partners-enabled] API error", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

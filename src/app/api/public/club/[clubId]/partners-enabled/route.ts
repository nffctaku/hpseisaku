import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";

export const runtime = "nodejs";

async function resolveOwnerUid(clubId: string): Promise<string | null> {
  try {
    const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
    const profileSnap = await profilesQuery.get();

    if (!profileSnap.empty) {
      const doc = profileSnap.docs[0];
      const data = doc.data() as any;
      return (data.ownerUid as string) || doc.id;
    }

    const directSnap = await db.collection("club_profiles").doc(clubId).get();
    if (directSnap.exists) {
      const data = directSnap.data() as any;
      return (data.ownerUid as string) || directSnap.id;
    }

    const ownerSnap = await db.collection("club_profiles").where("ownerUid", "==", clubId).limit(1).get();
    if (!ownerSnap.empty) {
      const doc = ownerSnap.docs[0];
      const data = doc.data() as any;
      return (data.ownerUid as string) || doc.id;
    }

    return null;
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

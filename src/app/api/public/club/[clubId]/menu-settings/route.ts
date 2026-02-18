import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";

export const runtime = "nodejs";

async function resolveClubProfile(clubId: string): Promise<any | null> {
  try {
    const directSnap = await db.collection("club_profiles").doc(clubId).get();
    if (directSnap.exists) {
      return directSnap;
    }

    const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
    const profileSnap = await profilesQuery.get();

    if (!profileSnap.empty) {
      return profileSnap.docs[0];
    }

    const ownerSnap = await db.collection("club_profiles").where("ownerUid", "==", clubId).limit(1).get();
    if (!ownerSnap.empty) {
      return ownerSnap.docs[0];
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
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const url = new URL(request.url);
    const debug = url.searchParams.get("debug") === "1";

    const snap = await resolveClubProfile(clubId);
    if (!snap || !snap.exists) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const data = snap.data() as any;
    const s = (data?.displaySettings || {}) as any;

    const out = {
      menuShowNews: s.menuShowNews !== false,
      menuShowTv: s.menuShowTv !== false,
      menuShowClub: s.menuShowClub !== false,
      menuShowTransfers: s.menuShowTransfers !== false,
      menuShowMatches: s.menuShowMatches !== false,
      menuShowTable: s.menuShowTable !== false,
      menuShowStats: s.menuShowStats !== false,
      menuShowSquad: s.menuShowSquad !== false,
      menuShowPartner: s.menuShowPartner !== false,
    };

    const payload: any = { ok: true, settings: out };
    if (debug) {
      payload.debug = {
        profileDocId: snap.id,
        profilePath: snap.ref.path,
        clubIdParam: clubId,
        storedClubId: typeof data?.clubId === "string" ? data.clubId : null,
        storedOwnerUid: typeof data?.ownerUid === "string" ? data.ownerUid : null,
        rawDisplaySettings: s,
      };
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[menu-settings] API error", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

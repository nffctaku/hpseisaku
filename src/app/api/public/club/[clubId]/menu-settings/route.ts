import { NextRequest, NextResponse } from "next/server";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params;
    if (!clubId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const url = new URL(request.url);
    const debug = url.searchParams.get("debug") === "1";

    const resolved = await resolvePublicClubProfile(clubId);
    if (!resolved) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const payload: any = { ok: true, settings: resolved.displaySettings };
    if (debug) {
      const data = resolved.profileData as any;
      payload.debug = {
        profileDocId: resolved.profileDocId,
        clubIdParam: clubId,
        resolvedClubUid: resolved.clubUid,
        resolvedClubId: resolved.clubId,
        storedClubId: typeof data?.clubId === "string" ? data.clubId : null,
        storedOwnerUid: typeof data?.ownerUid === "string" ? data.ownerUid : null,
        rawDisplaySettings: data?.displaySettings || {},
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

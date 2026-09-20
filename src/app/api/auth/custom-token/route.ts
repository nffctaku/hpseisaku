import { NextRequest, NextResponse } from "next/server";
import { auth as adminAuth } from "@/lib/firebase/admin";

// mobile復旧経路: GIS→REST signInWithIdpで得たFirebase ID tokenを検証し、
// 同じUIDのCustom Tokenを発行する。クライアントはこれで signInWithCustomToken。
export async function POST(req: NextRequest) {
  try {
    const { idToken } = (await req.json()) as { idToken?: string };
    if (typeof idToken !== "string" || !idToken) {
      return NextResponse.json({ error: "idToken is required" }, { status: 400 });
    }
    const decoded = await adminAuth.verifyIdToken(idToken);
    const customToken = await adminAuth.createCustomToken(decoded.uid);
    return NextResponse.json({ customToken });
  } catch (e: any) {
    console.error("[custom-token] error", e);
    return NextResponse.json(
      { error: e?.message || "custom token issuance failed" },
      { status: 401 }
    );
  }
}

import { NextResponse } from "next/server";
import { listPublishedUpdates } from "@/lib/updates-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = (await listPublishedUpdates()).slice(0, 10);
    if (items.length > 0) {
      return NextResponse.json(
        { ok: true, items },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const fallback = [
      {
        id: "welcome",
        title: "運営からのお知らせは準備中です",
        body: "今後こちらにアップデート情報を掲載します。",
        description: "今後こちらにアップデート情報を掲載します。",
        category: "その他",
      },
    ];

    return NextResponse.json(
      { ok: true, items: fallback },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    console.error("[public/updates] API error", e);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

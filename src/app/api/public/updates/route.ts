import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type UpdateItem = {
  id: string;
  title: string;
  body?: string;
  linkUrl?: string;
  publishedAt?: string;
};

export async function GET() {
  try {
    try {
      const ref = db.collection("app_updates").orderBy("publishedAt", "desc").limit(5);
      const snap = await ref.get();

      if (!snap.empty) {
        const items: UpdateItem[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const ts = data?.publishedAt;
          const publishedAt = ts?.toDate && typeof ts.toDate === "function" ? ts.toDate().toISOString() : typeof ts === "string" ? ts : undefined;

          return {
            id: d.id,
            title: typeof data?.title === "string" ? data.title : "",
            body: typeof data?.body === "string" ? data.body : undefined,
            linkUrl: typeof data?.linkUrl === "string" ? data.linkUrl : undefined,
            publishedAt,
          };
        });

        return NextResponse.json(
          { ok: true, items },
          {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      }
    } catch {
      // ignore
    }

    const fallback: UpdateItem[] = [
      {
        id: "welcome",
        title: "運営からのお知らせは準備中です",
        body: "今後こちらにアップデート情報を掲載します。",
      },
    ];

    return NextResponse.json(
      { ok: true, items: fallback },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (e) {
    console.error("[public/updates] API error", e);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

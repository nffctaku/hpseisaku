import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { db } from "@/lib/firebase/admin";
import { getBookletShare } from "@/lib/booklet-share";
import { safeString } from "@/app/api/admin/booklet/lib";

export const runtime = "nodejs";
// 公開・非公開を即時反映するためキャッシュしない
export const dynamic = "force-dynamic";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

async function getOgData(publicId: string) {
  const share = await getBookletShare(publicId);
  if (!share || !share.isPublished) return null;

  let clubName = "";
  let logoUrl: string | null = null;
  let homeBgColor: string | null = null;
  try {
    const snap = await db.collection("club_profiles").doc(share.clubUid).get();
    const d = snap.exists ? (snap.data() as any) : null;
    clubName = safeString(d?.clubName);
    if (typeof d?.logoUrl === "string" && d.logoUrl.trim()) logoUrl = d.logoUrl.trim();
    if (typeof d?.homeBgColor === "string" && d.homeBgColor.trim())
      homeBgColor = d.homeBgColor.trim();
  } catch {
    // フォールバック色で生成
  }

  return { season: share.season, clubName, logoUrl, homeBgColor };
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const data = await getOgData(publicId);
  if (!data) notFound();

  const homeBg = data.homeBgColor || "#C8102E";
  const clubName = data.clubName || "チーム";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${homeBg} 0%, #111827 70%, #0b1220 100%)`,
          position: "relative",
          padding: 64,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 45%)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            marginBottom: 40,
          }}
        >
          {data.logoUrl ? (
            <img
              src={data.logoUrl}
              width={120}
              height={120}
              style={{ borderRadius: 999, background: "#ffffff", objectFit: "contain" }}
              alt="logo"
            />
          ) : (
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 999,
                background: "rgba(255,255,255,0.15)",
                border: "3px solid rgba(255,255,255,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.7)",
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              LOGO
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                color: "#ffffff",
                lineHeight: 1.1,
                textShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              {clubName}
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {`${data.season} 選手名鑑`}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: "rgba(255,255,255,0.14)",
            border: "1px solid rgba(255,255,255,0.22)",
            borderRadius: 999,
            padding: "12px 28px",
            color: "#ffffff",
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          Powered by FootChron
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
    }
  );
}

import { ImageResponse } from "next/og";
import { db } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

async function getClubOgData(clubId: string): Promise<{
  clubName: string;
  logoUrl: string | null;
  homeBgColor: string | null;
} | null> {
  try {
    const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
    const profilesSnap = await profilesQuery.get();

    const clubProfileDoc = !profilesSnap.empty ? profilesSnap.docs[0] : null;
    const directSnap = clubProfileDoc ? null : await db.collection("club_profiles").doc(clubId).get();

    if (!clubProfileDoc && !directSnap?.exists) {
      return null;
    }

    const profileData = (clubProfileDoc ? clubProfileDoc.data() : (directSnap!.data() as any))! as any;
    const ownerUid = profileData?.ownerUid || (clubProfileDoc ? clubProfileDoc.id : directSnap!.id);

    const mainTeamId = profileData?.mainTeamId;
    let mainTeamData: any = null;
    if (ownerUid && mainTeamId) {
      const mainTeamSnap = await db.collection(`clubs/${ownerUid}/teams`).doc(mainTeamId).get();
      if (mainTeamSnap.exists) mainTeamData = mainTeamSnap.data();
    }

    const clubNameRaw = (mainTeamData as any)?.name || profileData?.clubName || clubId;
    const logoUrlRaw = (mainTeamData as any)?.logoUrl || profileData?.logoUrl || null;
    const homeBgColorRaw = profileData?.homeBgColor || null;

    const clubName = typeof clubNameRaw === "string" && clubNameRaw.trim() ? clubNameRaw.trim() : clubId;
    const logoUrl = typeof logoUrlRaw === "string" && logoUrlRaw.trim() ? logoUrlRaw.trim() : null;
    const homeBgColor = typeof homeBgColorRaw === "string" && homeBgColorRaw.trim() ? homeBgColorRaw.trim() : null;

    return { clubName, logoUrl, homeBgColor };
  } catch {
    return null;
  }
}

export default async function OpenGraphImage({ params }: { params: { clubId: string } }) {
  const clubId = params.clubId;
  const data = await getClubOgData(clubId);

  const clubName = data?.clubName || clubId;
  const logoUrl = data?.logoUrl;
  const homeBg = data?.homeBgColor || "#0b1220";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${homeBg} 0%, #0b1220 55%, #111827 100%)`,
          color: "#0f172a",
          position: "relative",
          padding: 64,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 20% 25%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%), radial-gradient(circle at 85% 65%, rgba(59,130,246,0.25) 0%, rgba(59,130,246,0) 55%)",
          }}
        />

        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 56,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 520 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                background: "rgba(255,255,255,0.18)",
                color: "#ffffff",
                borderRadius: 999,
                padding: "10px 16px",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "#22c55e",
                  boxShadow: "0 0 0 6px rgba(34,197,94,0.2)",
                }}
              />
              OFFICIAL WEBSITE
            </div>

            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: "#ffffff",
                lineHeight: 1.08,
                textShadow: "0 10px 24px rgba(0,0,0,0.35)",
              }}
            >
              {clubName}
            </div>

            <div
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                lineHeight: 1.4,
              }}
            >
              クラブの最新情報・試合結果・選手一覧をまとめてチェック
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "rgba(255,255,255,0.9)",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 12,
                  padding: "10px 14px",
                }}
              >
                footballtop
              </div>
              <div style={{ opacity: 0.85 }}>/{clubId}</div>
            </div>
          </div>

          <div
            style={{
              width: 420,
              height: 560,
              borderRadius: 48,
              background: "#0b0f18",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
              border: "10px solid rgba(255,255,255,0.08)",
              padding: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 36,
                background: "#ffffff",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  height: 52,
                  background: "#0b0f18",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: 120,
                    height: 16,
                    background: "rgba(255,255,255,0.14)",
                    borderRadius: 999,
                  }}
                />
              </div>

              <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      width={88}
                      height={88}
                      style={{ borderRadius: 999, background: "#ffffff", objectFit: "contain" }}
                      alt="logo"
                    />
                  ) : (
                    <div
                      style={{
                        width: 88,
                        height: 88,
                        borderRadius: 999,
                        background: "#e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#6b7280",
                        fontSize: 18,
                        fontWeight: 800,
                      }}
                    >
                      LOGO
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", lineHeight: 1.1 }}>
                      {clubName}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#64748b" }}>
                      公式ホームページ
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      background: "#f1f5f9",
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 14, color: "#64748b", fontWeight: 700 }}>直近の試合</div>
                    <div style={{ fontSize: 18, color: "#0f172a", fontWeight: 900 }}>結果・日程</div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      background: "#f1f5f9",
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 14, color: "#64748b", fontWeight: 700 }}>選手一覧</div>
                    <div style={{ fontSize: 18, color: "#0f172a", fontWeight: 900 }}>プロフィール</div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 4,
                    borderRadius: 18,
                    background: "linear-gradient(90deg, #2563eb 0%, #06b6d4 100%)",
                    color: "#ffffff",
                    padding: "14px 16px",
                    fontSize: 18,
                    fontWeight: 900,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>サイトを見る</span>
                  <span style={{ opacity: 0.9 }}>→</span>
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                  Powered by Footballtop
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
    }
  );
}

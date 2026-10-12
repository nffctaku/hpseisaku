import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { db } from "@/lib/firebase/admin";
import { getBookletShare } from "@/lib/booklet-share";
import { getBookletTeamData } from "@/lib/booklet-data-server";
import { getCareer } from "@/lib/career-server";
import { isParodyClub } from "@/lib/parody";
import { getContrastTextColor, isColorDark } from "@/lib/utils";
import { safeString } from "@/app/api/admin/booklet/lib";

export const runtime = "nodejs";
// 公開・非公開を即時反映するためキャッシュしない
export const dynamic = "force-dynamic";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

type OgPlayer = {
  number: string;
  name: string;
  position: string;
  photoUrl: string | null;
  photoSrc: string | null;
};

// 外部画像取得失敗でOGP全体を落とさないよう、事前にdata URL化する。
// 取得不可・非画像・3MB超はプレースホルダーにフォールバック。
async function fetchImageAsDataUrl(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    if (!/^https?:\/\//.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 3_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// 明るすぎるクラブカラーを暗色側へ寄せる（白文字の視認性確保）
function darkenHex(hex: string, ratio: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "#1e293b";
  const n = parseInt(m[1], 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - ratio))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

async function getOgData(publicId: string) {
  const share = await getBookletShare(publicId);
  if (!share || !share.isPublished) return null;

  // ページと同じ所有者・Career検証
  const career = await getCareer(share.careerId);
  if (!career || career.ownerId !== share.ownerUid || career.clubUid !== share.clubUid) return null;

  let clubName = "";
  let logoUrl: string | null = null;
  let homeBgColor: string | null = null;
  let realTeamUsage: boolean | undefined;
  let gameTeamUsage: boolean | undefined;
  try {
    const snap = await db.collection("club_profiles").doc(share.clubUid).get();
    const d = snap.exists ? (snap.data() as any) : null;
    clubName = safeString(d?.clubName);
    if (typeof d?.logoUrl === "string" && d.logoUrl.trim()) logoUrl = d.logoUrl.trim();
    if (typeof d?.homeBgColor === "string" && d.homeBgColor.trim())
      homeBgColor = d.homeBgColor.trim();
    if (typeof d?.realTeamUsage === "boolean") realTeamUsage = d.realTeamUsage;
    if (typeof d?.gameTeamUsage === "boolean") gameTeamUsage = d.gameTeamUsage;
  } catch {
    // フォールバック値で生成
  }

  // OGPは cardPlayerIds の先頭最大3名のみ使用（選択順を維持）
  const players: OgPlayer[] = [];
  const firstIds = share.cardPlayerIds.slice(0, 3);
  if (firstIds.length > 0) {
    try {
      const data = await getBookletTeamData({
        ownerUid: share.clubUid,
        teamId: share.teamId,
        seasonId: share.season,
        clubProfile: { clubName, logoUrl },
        playerIds: new Set(firstIds),
      });
      const byId = new Map(data.players.map((p) => [String(p.id), p]));
      for (const pid of firstIds) {
        const p = byId.get(pid);
        if (!p) continue; // 削除済み・参照不能は除外
        players.push({
          number: p.number != null ? String(p.number) : "-",
          name: safeString(p.name) || "-",
          position: safeString(p.mainPosition || p.position) || "",
          photoUrl: typeof p.photoUrl === "string" && p.photoUrl.trim() ? p.photoUrl.trim() : null,
          photoSrc: null,
        });
      }
    } catch {
      // 選手取得失敗時はエンブレム型フォールバックへ
    }
  }

  // 画像は失敗してもOGPを落とさない
  const [logoSrc, ...photoSrcs] = await Promise.all([
    logoUrl ? fetchImageAsDataUrl(logoUrl) : Promise.resolve(null),
    ...players.map((p) => (p.photoUrl ? fetchImageAsDataUrl(p.photoUrl) : Promise.resolve(null))),
  ]);
  players.forEach((p, i) => {
    p.photoSrc = photoSrcs[i] ?? null;
  });

  return {
    season: share.season,
    clubName,
    logoSrc,
    homeBgColor,
    isParody: isParodyClub({ realTeamUsage, gameTeamUsage }),
    players,
  };
}

const SQUAD_LABEL = "SQUAD BOOKLET";
const PARODY_LABEL = "PARODY / FAN-MADE";
const PARODY_NOTE = "FootChron利用者による非公式の創作コンテンツです。";

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function silhouette(h: number) {
  return (
    <svg viewBox="0 0 48 48" width={Math.round(h * 0.55)} height={Math.round(h * 0.55)}>
      <circle cx="24" cy="16" r="8" fill="#64748b" opacity="0.7" />
      <path d="M9 42c1.8-9 7.6-14 15-14s13.2 5 15 14" fill="#64748b" opacity="0.45" />
    </svg>
  );
}

function playerCard(
  p: OgPlayer,
  kind: "main" | "sub",
  accent: string,
  accentText: string,
  rotate?: string
) {
  const main = kind === "main";
  const W = main ? 250 : 190;
  const H = main ? 350 : 260;
  const photoH = main ? 205 : 145;
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        background: "#f8fafc",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 18px 42px rgba(0,0,0,0.45)",
        border: "1px solid rgba(255,255,255,0.28)",
        ...(rotate ? { transform: rotate } : {}),
      }}
    >
      <div
        style={{
          width: "100%",
          height: photoH,
          background: "#334155",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {p.photoSrc ? (
          <img
            src={p.photoSrc}
            width={W}
            height={photoH}
            style={{ objectFit: "cover", objectPosition: "top" }}
            alt=""
          />
        ) : (
          silhouette(photoH)
        )}
        {main ? (
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              display: "flex",
              background: accent,
              color: getContrastTextColor(accent),
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 2,
              padding: "5px 10px",
              borderRadius: 6,
            }}
          >
            BOOKLET EDITION
          </div>
        ) : null}
      </div>
      <div style={{ height: 8, background: accent, display: "flex" }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: main ? "12px 16px" : "9px 12px",
          gap: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{
              fontSize: main ? 36 : 26,
              fontWeight: 900,
              color: accentText,
              lineHeight: 1,
            }}
          >
            {p.number}
          </span>
          <span
            style={{
              fontSize: main ? 15 : 12,
              fontWeight: 700,
              color: "#64748b",
              letterSpacing: 1,
            }}
          >
            {truncate(p.position, 10)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: main ? 26 : 18,
            fontWeight: 800,
            color: "#0f172a",
            lineHeight: 1.15,
          }}
        >
          {truncate(p.name, main ? 11 : 9)}
        </div>
      </div>
    </div>
  );
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const data = await getOgData(publicId);
  if (!data) notFound();

  const rawAccent = data.homeBgColor || "#C8102E";
  // 背景の視認性: 明るいクラブカラーは暗く寄せる
  const bgAccent = isColorDark(rawAccent) ? rawAccent : darkenHex(rawAccent, 0.55);
  // カード上の数字・帯は原色寄りだが、白背景で読めるよう暗色ならやや明るく/明色なら暗く
  const accent = rawAccent;
  const accentText = isColorDark(rawAccent) ? rawAccent : darkenHex(rawAccent, 0.45);
  const clubName = data.clubName || "チーム";
  const nameFont = clubName.length > 20 ? 34 : clubName.length > 12 ? 44 : 54;

  const players = data.players;
  const [p0, p1, p2] = players;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(135deg, ${bgAccent} 0%, #111827 55%, #0b1220 100%)`,
          position: "relative",
          padding: "40px 56px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 45%)",
          }}
        />

        {data.isParody ? (
          <div
            style={{
              position: "absolute",
              top: 28,
              right: 40,
              display: "flex",
              alignItems: "center",
              background: "rgba(17,24,39,0.8)",
              border: "2px solid rgba(255,255,255,0.55)",
              borderRadius: 999,
              padding: "10px 22px",
              color: "#ffffff",
              fontSize: 21,
              fontWeight: 900,
              letterSpacing: 3,
            }}
          >
            {PARODY_LABEL}
          </div>
        ) : null}

        {/* ヘッダー: クラブ情報 */}
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {data.logoSrc ? (
            <img
              src={data.logoSrc}
              width={88}
              height={88}
              style={{ borderRadius: 999, background: "#ffffff", objectFit: "contain" }}
              alt="logo"
            />
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "rgba(255,255,255,0.75)",
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: 5,
              }}
            >
              <span style={{ width: 20, height: 4, background: accent, display: "flex" }} />
              {SQUAD_LABEL}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: nameFont,
                fontWeight: 900,
                color: "#ffffff",
                lineHeight: 1.1,
                textShadow: "0 6px 20px rgba(0,0,0,0.4)",
              }}
            >
              {truncate(clubName, 26)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {`${data.season} SEASON`}
            </div>
          </div>
        </div>

        {/* カード領域 */}
        <div style={{ display: "flex", position: "relative", flex: 1 }}>
          {players.length === 0 ? (
            // 選手0名: エンブレム中心のフォールバック
            <div
              style={{
                display: "flex",
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 24,
              }}
            >
              {data.logoSrc ? (
                <img
                  src={data.logoSrc}
                  width={150}
                  height={150}
                  style={{ borderRadius: 999, background: "#ffffff", objectFit: "contain" }}
                  alt="logo"
                />
              ) : (
                <div
                  style={{
                    width: 150,
                    height: 150,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.15)",
                    border: "3px solid rgba(255,255,255,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 28,
                    fontWeight: 800,
                  }}
                >
                  LOGO
                </div>
              )}
            </div>
          ) : (
            <>
              {p2 && players.length >= 3 ? (
                <div style={{ position: "absolute", left: 150, top: 74, display: "flex" }}>
                  {playerCard(p2, "sub", accent, accentText, "rotate(-6deg)")}
                </div>
              ) : null}
              {p1 ? (
                <div
                  style={{
                    position: "absolute",
                    left: players.length >= 3 ? 748 : 620,
                    top: 74,
                    display: "flex",
                  }}
                >
                  {playerCard(p1, "sub", accent, accentText, "rotate(6deg)")}
                </div>
              ) : null}
              <div
                style={{
                  position: "absolute",
                  left: players.length >= 3 ? 419 : players.length === 2 ? 300 : 419,
                  top: 14,
                  display: "flex",
                }}
              >
                {playerCard(p0, "main", accent, accentText)}
              </div>
            </>
          )}
        </div>

        {/* フッター */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: 999,
              padding: "10px 24px",
              color: "#ffffff",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            Powered by FootChron
          </div>
          {data.isParody ? (
            <div
              style={{
                display: "flex",
                color: "rgba(255,255,255,0.8)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {PARODY_NOTE}
            </div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
    }
  );
}

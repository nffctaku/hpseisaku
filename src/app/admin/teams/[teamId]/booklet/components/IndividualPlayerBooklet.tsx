"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { PublicPlayerHexChart } from "@/components/public-player-hex-chart";
import type { BookletPlayer } from "../types";
import { preferredFootLabel } from "../lib/booklet-utils";

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortPosition(position: string): string {
  const pos = String(position || "").toUpperCase();
  return (pos.match(/^(FW|MF|DF|GK)$/)?.[1] as string) || pos || "-";
}

function profileText(player: BookletPlayer): string {
  return String(player.memo || "").trim() || String(player.profile || "").trim() || "プロフィール未入力";
}

function statValue(value: number | null | undefined, suffix = ""): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}${suffix}` : "-";
}

function downloadSvg(player: BookletPlayer, season: string) {
  const labels = player.params?.items?.map((item) => item.label || "-") ?? ["", "", "", "", "", ""];
  const values = player.params?.items?.map((item) => Math.max(0, Math.min(99, Number(item.value) || 0))) ?? [0, 0, 0, 0, 0, 0];
  const points = values.map((v, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 6;
    const r = 72 * (v / 99);
    return `${472 + r * Math.cos(angle)},${404 + r * Math.sin(angle)}`;
  }).join(" ");
  const outer = Array.from({ length: 6 }).map((_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 6;
    return `${472 + 72 * Math.cos(angle)},${404 + 72 * Math.sin(angle)}`;
  }).join(" ");
  const safeName = String(player.name || "player").replace(/[\\/:*?"<>|]/g, "_");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1000" viewBox="0 0 900 1000">
<rect width="900" height="1000" fill="#f3f4f6"/>
<rect x="24" y="20" width="852" height="960" rx="20" fill="#fff" stroke="#e5e7eb"/>
<rect x="48" y="44" width="56" height="140" rx="4" fill="#4ade80"/>
<text x="76" y="84" text-anchor="middle" font-size="30" font-weight="800" fill="#fff">${escapeXml(player.number ?? "-")}</text>
<text x="76" y="124" text-anchor="middle" font-size="26" font-weight="800" fill="#fff">${escapeXml(shortPosition(player.position))}</text>
<rect x="48" y="44" width="320" height="320" rx="8" fill="#f1f5f9" stroke="#e5e7eb"/>
${player.photoUrl ? `<image href="${escapeXml(player.photoUrl)}" x="48" y="44" width="320" height="320" preserveAspectRatio="xMidYMid slice"/>` : `<text x="208" y="214" text-anchor="middle" font-size="24" fill="#94a3b8">NO PHOTO</text>`}
<text x="400" y="88" font-size="36" font-weight="800" fill="#111827">${escapeXml(player.name)}</text>
<text x="400" y="132" font-size="22" fill="#4b5563">${escapeXml(player.mainPosition || player.position || "")}</text>
<text x="400" y="190" font-size="18" font-weight="700" fill="#374151">生年月日</text><text x="540" y="190" font-size="20" fill="#111827">${escapeXml(player.dateOfBirth || (player.age != null ? `${player.age}歳` : "-"))}</text>
<text x="400" y="230" font-size="18" font-weight="700" fill="#374151">国籍</text><text x="540" y="230" font-size="20" fill="#111827">${escapeXml(player.nationality || "-")}</text>
<text x="400" y="270" font-size="18" font-weight="700" fill="#374151">身長 / 体重</text><text x="540" y="270" font-size="20" fill="#111827">${escapeXml(`${statValue(player.height, "cm")} / ${statValue(player.weight, "kg")}`)}</text>
<text x="400" y="310" font-size="18" font-weight="700" fill="#374151">利き足</text><text x="540" y="310" font-size="20" fill="#111827">${escapeXml(preferredFootLabel(player.preferredFoot))}</text>
<text x="400" y="350" font-size="18" font-weight="700" fill="#374151">背番号</text><text x="540" y="350" font-size="20" fill="#111827">${escapeXml(player.number ?? "-")}</text>
<rect x="48" y="392" width="804" height="112" rx="8" fill="#fff" stroke="#e5e7eb"/>
<foreignObject x="72" y="412" width="756" height="72"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:18px;line-height:1.55;color:#374151;font-weight:600;white-space:pre-wrap;font-family:Arial, sans-serif;">${escapeXml(profileText(player))}</div></foreignObject>
<rect x="48" y="528" width="804" height="250" rx="8" fill="#fff" stroke="#e5e7eb"/>
<text x="72" y="570" font-size="22" font-weight="800" fill="#111827">ステータス</text>
<text x="72" y="610" font-size="18" font-weight="700" fill="#374151">出場試合数</text><text x="220" y="610" font-size="18" fill="#111827">${escapeXml(statValue(player.seasonStats?.appearances, "試合"))}</text>
<text x="72" y="646" font-size="18" font-weight="700" fill="#374151">得点数</text><text x="220" y="646" font-size="18" fill="#111827">${escapeXml(statValue(player.seasonStats?.goals, "得点"))}</text>
<text x="72" y="682" font-size="18" font-weight="700" fill="#374151">アシスト数</text><text x="220" y="682" font-size="18" fill="#111827">${escapeXml(statValue(player.seasonStats?.assists, "アシスト"))}</text>
<text x="72" y="718" font-size="18" font-weight="700" fill="#374151">平均評価</text><text x="220" y="718" font-size="18" fill="#16a34a" font-weight="800">${escapeXml(player.seasonStats?.avgRating ?? "-")}</text>
<polygon points="${outer}" fill="none" stroke="#cbd5e1" stroke-width="2"/>
<polygon points="${points}" fill="#dbeafe" stroke="#60a5fa" stroke-width="3"/>
${labels.map((label, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 6;
    return `<text x="${472 + 104 * Math.cos(angle)}" y="${404 + 104 * Math.sin(angle)}" font-size="12" text-anchor="middle" fill="#334155">${escapeXml(label)}</text>`;
  }).join("")}
<rect x="48" y="802" width="804" height="130" rx="8" fill="#fff" stroke="#e5e7eb"/>
<text x="72" y="844" font-size="22" font-weight="800" fill="#111827">シーズン成績（${escapeXml(season)}）</text>
<text x="176" y="892" font-size="18" text-anchor="middle" fill="#374151">出場</text><text x="176" y="920" font-size="24" font-weight="800" text-anchor="middle" fill="#111827">${escapeXml(player.seasonStats?.appearances ?? 0)}</text>
<text x="352" y="892" font-size="18" text-anchor="middle" fill="#374151">得点</text><text x="352" y="920" font-size="24" font-weight="800" text-anchor="middle" fill="#111827">${escapeXml(player.seasonStats?.goals ?? 0)}</text>
<text x="528" y="892" font-size="18" text-anchor="middle" fill="#374151">アシスト</text><text x="528" y="920" font-size="24" font-weight="800" text-anchor="middle" fill="#111827">${escapeXml(player.seasonStats?.assists ?? 0)}</text>
<text x="704" y="892" font-size="18" text-anchor="middle" fill="#374151">平均評価</text><text x="704" y="920" font-size="24" font-weight="800" text-anchor="middle" fill="#111827">${escapeXml(player.seasonStats?.avgRating ?? "-")}</text>
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}_個人名鑑.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

export function IndividualPlayerBooklet({ players, season }: { players: BookletPlayer[]; season: string }) {
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999)), [players]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(sortedPlayers[0]?.id || "");
  const selectedPlayer = sortedPlayers.find((p) => p.id === selectedPlayerId) || sortedPlayers[0] || null;

  if (!selectedPlayer) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-gray-600">選手データがありません。</div>;
  }

  const labels = selectedPlayer.params?.items?.map((item) => item.label) ?? ["", "", "", "", "", ""];
  const values = selectedPlayer.params?.items?.map((item) => item.value) ?? [0, 0, 0, 0, 0, 0];

  return (
    <div className="space-y-4">
      <div className="no-print rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-sm font-semibold text-gray-700">個人名鑑を作成する選手</label>
            <select
              value={selectedPlayer.id}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              {sortedPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.number != null ? `${player.number} ` : ""}{player.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => downloadSvg(selectedPlayer, season)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            画像をダウンロード
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] rounded-2xl bg-white p-5 text-gray-900 shadow-sm ring-1 ring-gray-200">
        <div className="grid gap-5 md:grid-cols-[320px_1fr]">
          <div className="relative h-[320px] overflow-hidden rounded-lg bg-slate-100 ring-1 ring-gray-200">
            <div className="absolute left-0 top-0 z-10 flex h-24 w-14 flex-col items-center justify-center bg-emerald-400 text-white">
              <div className="text-2xl font-black leading-none">{selectedPlayer.number ?? "-"}</div>
              <div className="mt-1 text-lg font-black leading-none">{shortPosition(selectedPlayer.position)}</div>
            </div>
            {selectedPlayer.photoUrl ? (
              <Image src={selectedPlayer.photoUrl} alt={selectedPlayer.name} fill className="object-cover" sizes="320px" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">NO PHOTO</div>
            )}
          </div>

          <div className="min-w-0 py-2">
            <h2 className="text-3xl font-black leading-tight tracking-tight text-gray-900">{selectedPlayer.name}</h2>
            <div className="mt-2 text-lg font-semibold text-gray-500">{selectedPlayer.mainPosition || selectedPlayer.position}</div>
            <div className="mt-7 grid grid-cols-[96px_1fr] gap-x-5 gap-y-4 text-sm">
              <div className="font-bold text-gray-600">生年月日</div>
              <div className="font-semibold text-gray-900">{selectedPlayer.dateOfBirth || (selectedPlayer.age != null ? `${selectedPlayer.age}歳` : "-")}</div>
              <div className="font-bold text-gray-600">国籍</div>
              <div className="font-semibold text-gray-900">{selectedPlayer.nationality || "-"}</div>
              <div className="font-bold text-gray-600">身長 / 体重</div>
              <div className="font-semibold text-gray-900">{statValue(selectedPlayer.height, "cm")} / {statValue(selectedPlayer.weight, "kg")}</div>
              <div className="font-bold text-gray-600">利き足</div>
              <div className="font-semibold text-gray-900">{preferredFootLabel(selectedPlayer.preferredFoot)}</div>
              <div className="font-bold text-gray-600">ポジション</div>
              <div className="font-semibold text-gray-900">{selectedPlayer.position}</div>
              <div className="font-bold text-gray-600">背番号</div>
              <div className="font-semibold text-gray-900">{selectedPlayer.number ?? "-"}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-gray-200 p-4 text-sm font-semibold leading-7 text-gray-700 whitespace-pre-wrap">
          {profileText(selectedPlayer)}
        </div>

        <div className="mt-4 grid gap-4 rounded-lg border border-gray-200 p-4 md:grid-cols-[1fr_280px]">
          <div>
            <h3 className="text-base font-black text-gray-900">ステータス</h3>
            <div className="mt-3 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <div className="font-bold text-gray-600">出場試合数</div>
              <div className="font-semibold">{statValue(selectedPlayer.seasonStats?.appearances, "試合")}</div>
              <div className="font-bold text-gray-600">得点数</div>
              <div className="font-semibold">{statValue(selectedPlayer.seasonStats?.goals, "得点")}</div>
              <div className="font-bold text-gray-600">アシスト数</div>
              <div className="font-semibold">{statValue(selectedPlayer.seasonStats?.assists, "アシスト")}</div>
              <div className="font-bold text-gray-600">平均評価</div>
              <div className="font-black text-emerald-600">{selectedPlayer.seasonStats?.avgRating ?? "-"}</div>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <PublicPlayerHexChart labels={labels} values={values} overall={selectedPlayer.params?.overall ?? 0} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 text-base font-black">シーズン成績（{season}）</div>
          <div className="grid grid-cols-4 divide-x divide-gray-200 text-center">
            <div className="p-3"><div className="text-xs font-bold text-gray-500">出場</div><div className="mt-2 text-xl font-black">{selectedPlayer.seasonStats?.appearances ?? 0}</div></div>
            <div className="p-3"><div className="text-xs font-bold text-gray-500">得点</div><div className="mt-2 text-xl font-black">{selectedPlayer.seasonStats?.goals ?? 0}</div></div>
            <div className="p-3"><div className="text-xs font-bold text-gray-500">アシスト</div><div className="mt-2 text-xl font-black">{selectedPlayer.seasonStats?.assists ?? 0}</div></div>
            <div className="p-3"><div className="text-xs font-bold text-gray-500">平均評価</div><div className="mt-2 text-xl font-black">{selectedPlayer.seasonStats?.avgRating ?? "-"}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

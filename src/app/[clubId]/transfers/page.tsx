import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";

import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { SeasonDropdown } from "@/components/season-dropdown";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";
import { lightenColor } from "@/lib/utils";
import { User } from "lucide-react";

import type { TransferLog } from "@/types/transfer";
import { formatMoneyWithSymbol } from "@/lib/money";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "移籍履歴",
};

interface TransfersPageProps {
  params: { clubId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}

const sumFeesByCurrency = (rows: TransferLog[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const t of rows) {
    const fee = (t as any).fee as number | undefined;
    if (fee == null || !Number.isFinite(fee)) continue;
    const currency = ((t as any).feeCurrency as string | undefined) || "EUR";
    result[currency] = (result[currency] || 0) + fee;
  }
  return result;
};

const formatCurrencyAmount = (currency: string, amount: number): string => {
  if (currency === "EUR") {
    return `€${(amount / 1000000).toFixed(1)}M`;
  }
  return formatMoneyWithSymbol(amount, currency);
};

async function resolveClubProfile(clubId: string): Promise<any | null> {
  const resolved = await resolvePublicClubProfile(clubId);
  if (!resolved) return null;
  if (resolved.displaySettings.menuShowTransfers === false) return null;
  return { ...(resolved.profileData as any), ownerUid: resolved.ownerUid };
}

async function resolveTeamId(ownerUid: string, preferredTeamId?: string | null): Promise<string | null> {
  if (preferredTeamId && preferredTeamId.trim().length > 0) return preferredTeamId;
  try {
    const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).limit(1).get();
    if (teamsSnap.empty) return null;
    return teamsSnap.docs[0].id;
  } catch (e) {
    console.error("Failed to resolve teamId for transfers page", e);
    return null;
  }
}

async function fetchTransfers(ownerUid: string, teamId: string): Promise<TransferLog[]> {
  try {
    const snap = await db.collection(`clubs/${ownerUid}/teams/${teamId}/transfers`).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TransferLog));
  } catch (e) {
    console.error("Failed to fetch transfers", e);
    return [];
  }
}

export default async function TransfersPage({ params, searchParams }: TransfersPageProps) {
  const { clubId } = params;

  if (clubId === "admin") {
    notFound();
  }

  const profile = await resolveClubProfile(clubId);
  if (!profile) {
    notFound();
  }

  const transfersPublic = (profile as any).transfersPublic as boolean | undefined;
  const ownerUid = (profile as any).ownerUid as string | undefined;
  if (!ownerUid) {
    notFound();
  }

  const clubName = ((profile as any).clubName as string | undefined) ?? "";
  const logoUrl = (((profile as any).logoUrl as string | null | undefined) ?? null) as string | null;
  const snsLinks = ((profile as any).snsLinks as any) ?? {};
  const sponsors = (Array.isArray((profile as any).sponsors) ? ((profile as any).sponsors as any[]) : []) as any;
  const legalPages = (Array.isArray((profile as any).legalPages) ? ((profile as any).legalPages as any[]) : []) as any;
  const homeBgColor = (profile as any).homeBgColor as string | undefined;
  const gameTeamUsage = Boolean((profile as any).gameTeamUsage);

  if (transfersPublic === false) {
    return (
      <main className="min-h-screen flex flex-col bg-background text-foreground">
        <ClubFooter
          clubId={clubId}
          clubName={clubName}
          sponsors={sponsors}
          snsLinks={snsLinks}
          legalPages={legalPages}
          gameTeamUsage={Boolean(gameTeamUsage)}
        />
      </main>
    );
  }

  const teamId = await resolveTeamId(ownerUid, (profile as any).mainTeamId as string | undefined);
  if (!teamId) {
    notFound();
  }

  const transfers = await fetchTransfers(ownerUid, teamId);

  const seasons = Array.from(
    new Set(
      transfers
        .map((t) => (typeof t?.season === "string" ? t.season : ""))
        .filter((s) => s.length > 0)
    )
  ).sort((a, b) => b.localeCompare(a));

  const requestedSeason = typeof searchParams?.season === "string" ? searchParams.season : undefined;
  const activeSeason = requestedSeason && seasons.includes(requestedSeason) ? requestedSeason : seasons[0] || "";

  const seasonTransfers = activeSeason ? transfers.filter((t) => t.season === activeSeason) : transfers;

  const inTransfers = seasonTransfers
    .filter((t) => t.direction === "in")
    .slice()
    .sort((a, b) => (a.playerName || "").localeCompare(b.playerName || ""));

  const outTransfers = seasonTransfers
    .filter((t) => t.direction === "out")
    .slice()
    .sort((a, b) => (a.playerName || "").localeCompare(b.playerName || ""));

  const inTotals = sumFeesByCurrency(inTransfers);
  const outTotals = sumFeesByCurrency(outTransfers);

  const availableCurrencies = Array.from(
    new Set([...Object.keys(inTotals), ...Object.keys(outTotals)].filter((c) => c && c.length > 0))
  ).sort((a, b) => a.localeCompare(b));
  const activeCurrency = availableCurrencies.includes("EUR") ? "EUR" : availableCurrencies[0] || "EUR";

  const inTotal = (inTotals[activeCurrency] || 0) as number;
  const outTotal = (outTotals[activeCurrency] || 0) as number;
  const balanceTotal = ((outTotals[activeCurrency] || 0) - (inTotals[activeCurrency] || 0)) as number;

  // Calculate donut percentages
  const totalTransferAmount = inTotal + outTotal;
  const inPercentage = totalTransferAmount > 0 ? (inTotal / totalTransferAmount) * 100 : 50;
  const themeColor = homeBgColor || "#8A1E24";
  const outColor = "#2F7A56";
  const pageBackgroundColor = homeBgColor ? lightenColor(homeBgColor, 88) : "#FFF5E6";
  const balanceLabel = `${balanceTotal >= 0 ? "+" : ""}${formatCurrencyAmount(activeCurrency, balanceTotal)}`;
  const inLabel = formatCurrencyAmount(activeCurrency, inTotal);
  const outLabel = formatCurrencyAmount(activeCurrency, outTotal);

  const getInitial = (name: string): string => (name.trim().charAt(0) || "?").toUpperCase();
  const playerPlaceholder = <User className="h-6 w-6" strokeWidth={1.8} />;

  const TransferSection = ({ rows, directionLabel }: { rows: TransferLog[]; directionLabel: "IN" | "OUT" }) => {
    const counterpartyHeader = directionLabel === "IN" ? "移籍元" : "移籍先";
    const sectionTitle = directionLabel === "IN" ? "加入" : "退団";
    const accentColor = directionLabel === "IN" ? themeColor : outColor;

    return (
      <section className="mb-10">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-7 w-1 rounded-full" style={{ backgroundColor: accentColor }} />
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-black tracking-tight text-[#0B1410]">{sectionTitle}</h2>
              <span className="text-[11px] font-bold tracking-[0.24em] text-[#0B1410]/50">PLAYERS {directionLabel}</span>
            </div>
          </div>
          <span className="text-xs font-black tracking-[0.16em]" style={{ color: accentColor }}>{rows.length} PLAYERS</span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-md border border-[#0B1410]/10 bg-white px-5 py-10 text-sm text-[#0B1410]/60">データがありません。</div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-md border border-[#0B1410]/10 bg-white md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ backgroundColor: accentColor }} className="text-white">
                    <th className="px-5 py-2 text-left text-[11px] font-bold">選手</th>
                    <th className="px-4 py-2 text-center text-[11px] font-bold">ポジション</th>
                    <th className="px-4 py-2 text-center text-[11px] font-bold">年齢</th>
                    <th className="px-4 py-2 text-left text-[11px] font-bold">{counterpartyHeader}</th>
                    <th className="px-5 py-2 text-right text-[11px] font-bold">移籍金</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0B1410]/10">
                  {rows.map((t) => {
                    const fee = (t as any).fee as number | undefined;
                    const feeCurrency = (t as any).feeCurrency as string | undefined;
                    const kind = (t as any).kind as string | undefined;
                    const playerName = typeof (t as any).playerName === "string" ? (t as any).playerName : "";
                    const counterparty = typeof (t as any).counterparty === "string" ? (t as any).counterparty : "";

                    return (
                      <tr key={t.id} className="h-[76px] transition-colors hover:bg-[#0B1410]/[0.025]">
                        <td className="px-5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-[#0B1410]/10 text-[#0B1410]/70">{playerPlaceholder}</div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-[#0B1410]" title={playerName}>{playerName || "-"}</div>
                              <div className="mt-0.5 text-[11px] text-[#0B1410]/55">{kind || "完全"}移籍</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex min-w-9 items-center justify-center rounded border px-2 py-1 text-[11px] font-black" style={{ borderColor: `${accentColor}66`, color: accentColor }}>{t.position || "-"}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-[#0B1410]">{t.age != null ? t.age : "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1410]/10 text-xs font-black text-[#0B1410]">{getInitial(counterparty)}</div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-[#0B1410]" title={counterparty}>{counterparty || "-"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-lg font-black" style={{ color: accentColor }}>
                          {fee != null ? formatCurrencyAmount(feeCurrency || activeCurrency, fee) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((t) => {
                const fee = (t as any).fee as number | undefined;
                const feeCurrency = (t as any).feeCurrency as string | undefined;
                const kind = (t as any).kind as string | undefined;
                const playerName = typeof (t as any).playerName === "string" ? (t as any).playerName : "";
                const counterparty = typeof (t as any).counterparty === "string" ? (t as any).counterparty : "";

                return (
                  <div key={t.id} className="rounded-md border border-[#0B1410]/10 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-[#0B1410]/10 text-[#0B1410]/70">{playerPlaceholder}</div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-[#0B1410]">{playerName || "-"}</div>
                          <div className="mt-1 text-xs text-[#0B1410]/55">{t.position || "-"} / {t.age != null ? `${t.age}歳` : "年齢不明"} / {kind || "完全"}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-base font-black" style={{ color: accentColor }}>
                        {fee != null ? formatCurrencyAmount(feeCurrency || activeCurrency, fee) : "-"}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs">
                      <div className="font-bold text-[#0B1410]/45">{counterpartyHeader}</div>
                      <div className="truncate font-bold text-[#0B1410]">{counterparty || "-"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    );
  };

  return (
    <main className={`${inter.className} min-h-screen flex flex-col`} style={{ backgroundColor: pageBackgroundColor }}>
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} headerBackgroundColor={homeBgColor} />
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;500;600;700&family=IBM+Plex+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-[0.08em] text-[#0B1410] sm:text-5xl">移籍履歴</h1>
          <p className="mt-2 text-xs font-bold tracking-[0.28em] text-[#0B1410]/55">TRANSFER HISTORY</p>
          <div className="mt-4 h-1 w-12 rounded-full" style={{ backgroundColor: themeColor }} />
        </div>

        {seasons.length > 1 && (
          <div className="mb-6 flex items-center gap-3">
            <label className="text-xs font-bold tracking-[0.18em] text-[#0B1410]/60">シーズン</label>
            <SeasonDropdown seasons={seasons} activeSeason={activeSeason} />
          </div>
        )}

        <section className="mb-10 rounded-md border border-[#0B1410]/10 bg-white p-5 shadow-sm sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.35fr_0.75fr] lg:items-center">
            <div>
              <div className="text-xs font-black tracking-[0.22em]" style={{ color: themeColor }}>{activeSeason || "TRANSFER"}</div>
              <div className="mt-4 text-3xl font-black tracking-tight text-[#0B1410]">移籍収支</div>
              <div className="mt-3 text-sm font-semibold text-[#0B1410]/55">対象シーズン: {activeSeason || "ALL"}</div>
            </div>

            <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
              <div className="relative h-56 w-56 shrink-0 rounded-full" style={{ background: `conic-gradient(${themeColor} 0% ${inPercentage}%, ${outColor} ${inPercentage}% 100%)` }}>
                <div className="absolute inset-9 flex flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-[11px] font-bold tracking-[0.18em] text-[#0B1410]/50">収支</span>
                  <span className="mt-2 text-center text-2xl font-black tracking-tight" style={{ color: balanceTotal >= 0 ? outColor : themeColor }}>{balanceLabel}</span>
                </div>
              </div>

              <div className="w-full max-w-[220px] space-y-4">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: themeColor }} />
                  <span className="text-xs font-black tracking-[0.18em] text-[#0B1410]/55">IN</span>
                  <span className="ml-auto text-sm font-black" style={{ color: themeColor }}>{inLabel}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: outColor }} />
                  <span className="text-xs font-black tracking-[0.18em] text-[#0B1410]/55">OUT</span>
                  <span className="ml-auto text-sm font-black" style={{ color: outColor }}>{outLabel}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-[#0B1410]/10 pt-6 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <div>
                <div className="text-4xl font-black text-[#0B1410]">{inTransfers.length}</div>
                <div className="mt-1 text-sm font-black text-[#0B1410]">加入選手</div>
                <div className="text-[10px] font-bold tracking-[0.18em] text-[#0B1410]/45">PLAYERS IN</div>
              </div>
              <div>
                <div className="text-4xl font-black text-[#0B1410]">{outTransfers.length}</div>
                <div className="mt-1 text-sm font-black text-[#0B1410]">退団選手</div>
                <div className="text-[10px] font-bold tracking-[0.18em] text-[#0B1410]/45">PLAYERS OUT</div>
              </div>
            </div>
          </div>
        </section>

        <TransferSection rows={inTransfers} directionLabel="IN" />
        <TransferSection rows={outTransfers} directionLabel="OUT" />

        <div className="border-t border-[#0B1410]/15 pt-4 text-[11px] font-semibold text-[#0B1410]/55">
          完＝完全移籍 / レ＝レンタル移籍 / 昇＝昇格 / 解＝契約解除 / 満＝契約満了
        </div>
      </div>

      <ClubFooter
        clubId={clubId}
        clubName={clubName}
        sponsors={sponsors}
        snsLinks={snsLinks}
        legalPages={legalPages}
        gameTeamUsage={Boolean(gameTeamUsage)}
      />
    </main>
  );
}

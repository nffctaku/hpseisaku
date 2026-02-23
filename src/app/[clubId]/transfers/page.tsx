import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";

import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import { TransfersBalancePie } from "@/components/transfers-balance-pie";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";

import type { TransferLog } from "@/types/transfer";
import { formatMoneyWithSymbol } from "@/lib/money";

interface TransfersPageProps {
  params: { clubId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}

const truncateText = (text: string, max: number): string => {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max).join("")}…`;
};

const abbrevKind = (kind: string | undefined): string => {
  if (kind === "レンタル") return "レ";
  if (kind === "昇格") return "昇";
  if (kind === "満了") return "満";
  if (kind === "解除") return "解";
  return "完";
};

const sumFeesByCurrency = (rows: TransferLog[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const t of rows) {
    const fee = (t as any).fee as number | undefined;
    if (fee == null || !Number.isFinite(fee)) continue;
    const currency = ((t as any).feeCurrency as string | undefined) || "JPY";
    result[currency] = (result[currency] || 0) + fee;
  }
  return result;
};

const formatCurrencyAmount = (currency: string, amount: number): string => {
  return formatMoneyWithSymbol(amount, currency);
};

const formatFeesSummary = (fees: Record<string, number>): string => {
  const entries = Object.entries(fees)
    .filter(([, v]) => Number.isFinite(v) && v !== 0)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "-";
  return entries.map(([c, v]) => formatCurrencyAmount(c, v)).join(" / ");
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
        <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} headerBackgroundColor={homeBgColor} />

        <div className="flex-1 w-full">
          <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <a href={`/${clubId}/club`} className="text-sm text-muted-foreground hover:underline">
              &larr; {clubName || clubId}のCLUBに戻る
            </a>
            <div className="mt-6 rounded-lg border border-border bg-card text-card-foreground p-6">
              <h1 className="text-xl font-bold">移籍情報は公開されていません</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                このクラブの移籍履歴は現在非公開設定になっています。
              </p>
            </div>
          </div>
        </div>

        <PartnerStripClient clubId={clubId} />
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
  const activeCurrency = availableCurrencies.includes("JPY") ? "JPY" : availableCurrencies[0] || "JPY";

  const inTotal = (inTotals[activeCurrency] || 0) as number;
  const outTotal = (outTotals[activeCurrency] || 0) as number;
  const balanceTotal = ((outTotals[activeCurrency] || 0) - (inTotals[activeCurrency] || 0)) as number;

  const TransferTable = ({ rows, directionLabel }: { rows: TransferLog[]; directionLabel: string }) => {
    const counterpartyHeader = directionLabel === "IN" ? "移籍元" : "移籍先";
    const feeClass = directionLabel === "IN" ? "text-red-600" : "text-emerald-600";

    return (
      <div className="overflow-hidden rounded-lg bg-card text-card-foreground shadow-md border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">{directionLabel}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">データがありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="px-2 py-1 font-medium whitespace-nowrap">種</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap">選手名</th>
                  <th className="px-2 py-1 font-medium">{counterpartyHeader}</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap">Pos</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap">年齢</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((t) => {
                  const fee = (t as any).fee as number | undefined;
                  const feeCurrency = (t as any).feeCurrency as string | undefined;
                  const kind = (t as any).kind as string | undefined;
                  const playerName = typeof (t as any).playerName === "string" ? (t as any).playerName : "";
                  const counterparty = typeof (t as any).counterparty === "string" ? (t as any).counterparty : "";

                  return (
                    <tr key={t.id}>
                      <td className="px-2 py-1 font-medium whitespace-nowrap">{abbrevKind(kind)}</td>
                      <td className="px-2 py-1 font-medium whitespace-nowrap" title={playerName || ""}>
                        {playerName ? truncateText(playerName, 15) : "-"}
                      </td>
                      <td className="px-2 py-1" title={counterparty || ""}>
                        {counterparty ? truncateText(counterparty, 15) : "-"}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">{t.position || "-"}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{t.age != null ? t.age : "-"}</td>
                      <td className={`px-2 py-1 whitespace-nowrap font-semibold ${feeClass}`}>
                        {fee != null ? formatMoneyWithSymbol(fee, feeCurrency) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} headerBackgroundColor={homeBgColor} />

      <div className="flex-1 w-full">
        <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">移籍履歴</h1>
          </div>

          {seasons.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">シーズン</span>
              {seasons.map((s) => {
                const isActive = s === activeSeason;
                return (
                  <a
                    key={s}
                    href={`?season=${encodeURIComponent(s)}`}
                    className={
                      isActive
                        ? "rounded-md bg-sky-600 px-3 py-1 text-white"
                        : "rounded-md border border-sky-600 px-3 py-1 text-sky-700 hover:bg-sky-50"
                    }
                  >
                    {s}
                  </a>
                );
              })}
            </div>
          )}

          <TransfersBalancePie inTotal={inTotal} outTotal={outTotal} balanceTotal={balanceTotal} currencyLabel={activeCurrency} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TransferTable rows={inTransfers} directionLabel="IN" />
            <TransferTable rows={outTransfers} directionLabel="OUT" />
          </div>

          <div className="text-xs text-muted-foreground">
            完＝完全移籍 / レ＝レンタル移籍 / 昇＝昇格 / 解＝契約解除 / 満＝契約満了
          </div>
        </div>
      </div>

      <PartnerStripClient clubId={clubId} />
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

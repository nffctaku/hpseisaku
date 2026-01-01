import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";

import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";

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

const getSummaryTone = (fees: Record<string, number>): "neutral" | "positive" | "negative" => {
  const values = Object.values(fees).filter((v) => Number.isFinite(v) && v !== 0);
  if (values.length === 0) return "neutral";
  const allNonNegative = values.every((v) => v >= 0);
  const allNonPositive = values.every((v) => v <= 0);
  if (allNonNegative) return "positive";
  if (allNonPositive) return "negative";
  // Mixed currencies/signs: prefer negative to avoid misleading green
  return values.some((v) => v < 0) ? "negative" : "positive";
};

async function resolveClubProfile(clubId: string): Promise<any | null> {
  try {
    const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
    const profilesSnap = await profilesQuery.get();
    if (!profilesSnap.empty) {
      return profilesSnap.docs[0].data();
    }

    const directSnap = await db.collection("club_profiles").doc(clubId).get();
    if (directSnap.exists) {
      return directSnap.data();
    }

    return null;
  } catch (e) {
    console.error("Failed to resolve club profile for transfers page", e);
    return null;
  }
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
  const balanceTotals = Object.fromEntries(
    Array.from(new Set([...Object.keys(inTotals), ...Object.keys(outTotals)])).map((c) => [
      c,
      (outTotals[c] || 0) - (inTotals[c] || 0),
    ])
  );

  const TransferTable = ({ rows, directionLabel }: { rows: TransferLog[]; directionLabel: string }) => {
    const counterpartyHeader = directionLabel === "IN" ? "移籍元" : "移籍先";
    const feeClass = directionLabel === "IN" ? "text-red-600" : "text-emerald-600";

    return (
      <div className="overflow-hidden rounded-lg border-2 border-sky-600 bg-white">
        <div className="px-4 py-3 border-b border-sky-500">
          <h2 className="text-lg font-semibold">{directionLabel}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">データがありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-200">
                <tr className="text-left">
                  <th className="px-2 py-1 font-medium whitespace-nowrap bg-gray-200">種</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap bg-gray-200">選手名</th>
                  <th className="px-2 py-1 font-medium bg-gray-200">{counterpartyHeader}</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap bg-gray-200">Pos</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap bg-gray-200">年齢</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap bg-gray-200">金額</th>
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
    <main className="min-h-screen flex flex-col bg-white">
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} />

      <div className="flex-1 w-full">
        <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
          <div>
            <a href={`/${clubId}/club`} className="text-sm text-muted-foreground hover:underline">
              &larr; {clubName || clubId}のCLUBに戻る
            </a>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mt-2">
              <h1 className="text-3xl font-bold">移籍履歴</h1>

              {seasons.length > 0 && (
                <form className="flex items-center gap-2 text-sm" action="" method="get">
                  <label className="text-muted-foreground" htmlFor="season-select">
                    シーズン
                  </label>
                  <select
                    id="season-select"
                    name="season"
                    defaultValue={activeSeason}
                    className="border rounded-md px-2 py-1 bg-background text-foreground text-sm"
                  >
                    {seasons.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </form>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-lg border-2 border-sky-600 bg-white px-4 py-3">
              <div className="text-xs text-muted-foreground">IN 合計</div>
              <div className="text-sm font-semibold text-red-600">{formatFeesSummary(inTotals)}</div>
            </div>
            <div className="rounded-lg border-2 border-sky-600 bg-white px-4 py-3">
              <div className="text-xs text-muted-foreground">OUT 合計</div>
              <div className="text-sm font-semibold text-emerald-600">{formatFeesSummary(outTotals)}</div>
            </div>
            <div className="rounded-lg border-2 border-sky-600 bg-white px-4 py-3">
              <div className="text-xs text-muted-foreground">収支</div>
              <div
                className={`text-sm font-semibold ${
                  getSummaryTone(balanceTotals) === "negative"
                    ? "text-red-600"
                    : getSummaryTone(balanceTotals) === "positive"
                      ? "text-emerald-600"
                      : ""
                }`}
              >
                {formatFeesSummary(balanceTotals)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TransferTable rows={inTransfers} directionLabel="IN" />
            <TransferTable rows={outTransfers} directionLabel="OUT" />
          </div>

          <div className="text-xs text-muted-foreground">
            完＝完全移籍 / レ＝レンタル移籍 / 昇＝昇格 / 解＝契約解除 / 満＝契約満了
          </div>
        </div>
      </div>

      <ClubFooter clubId={clubId} clubName={clubName} sponsors={sponsors} snsLinks={snsLinks} legalPages={legalPages} />
    </main>
  );
}

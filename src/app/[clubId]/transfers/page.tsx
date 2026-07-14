import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";

import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { SeasonDropdown } from "@/components/season-dropdown";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";
import { lightenColor } from "@/lib/utils";

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
  const outPercentage = totalTransferAmount > 0 ? (outTotal / totalTransferAmount) * 100 : 50;

  const TransferTable = ({ rows, directionLabel }: { rows: TransferLog[]; directionLabel: string }) => {
    const counterpartyHeader = directionLabel === "IN" ? "移籍元" : "移籍先";
    const isLoss = directionLabel === "IN";

    return (
      <div style={{
        border: '1px solid #0B141033',
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 22px',
          borderBottom: '2px solid #0B1410',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            fontFamily: 'Anton, sans-serif',
            fontSize: '22px',
            color: '#0B1410',
            margin: 0
          }}>
            {directionLabel}
          </h2>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '13px',
            color: '#0B1410b3'
          }}>
            {rows.length} PLAYERS
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm" style={{ color: '#0B1410b3' }}>データがありません。</div>
        ) : (
          <table style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}>
              <thead>
                <tr>
                  <th style={{
                    padding: '8px',
                    textAlign: 'left',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    background: '#FFF5E6',
                    backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                    backgroundSize: '4px 4px'
                  }}>種</th>
                  <th style={{
                    padding: '8px',
                    textAlign: 'left',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    background: '#FFF5E6',
                    backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                    backgroundSize: '4px 4px'
                  }}>選手名</th>
                  <th className="hidden md:table-cell" style={{
                    padding: '8px',
                    textAlign: 'left',
                    fontWeight: '500',
                    background: '#FFF5E6',
                    backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                    backgroundSize: '4px 4px'
                  }}>{counterpartyHeader}</th>
                  <th style={{
                    padding: '8px',
                    textAlign: 'left',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    background: '#FFF5E6',
                    backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                    backgroundSize: '4px 4px'
                  }}>Pos</th>
                  <th style={{
                    padding: '8px',
                    textAlign: 'right',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    background: '#FFF5E6',
                    backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                    backgroundSize: '4px 4px'
                  }}>年齢</th>
                  <th style={{
                    padding: '8px',
                    textAlign: 'right',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    background: '#FFF5E6',
                    backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                    backgroundSize: '4px 4px'
                  }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const fee = (t as any).fee as number | undefined;
                  const feeCurrency = (t as any).feeCurrency as string | undefined;
                  const kind = (t as any).kind as string | undefined;
                  const playerName = typeof (t as any).playerName === "string" ? (t as any).playerName : "";
                  const counterparty = typeof (t as any).counterparty === "string" ? (t as any).counterparty : "";

                  return (
                    <tr key={t.id} style={{
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      <td style={{
                        padding: '8px',
                        whiteSpace: 'nowrap',
                        background: '#FFF5E6',
                        backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                        backgroundSize: '4px 4px'
                      }}>
                        <span style={{
                          display: 'inline-block',
                          border: '1px solid #0B1410',
                          borderRadius: '2px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: '#0B1410'
                        }}>
                          {abbrevKind(kind)}
                        </span>
                      </td>
                      <td style={{
                        padding: '8px',
                        whiteSpace: 'nowrap',
                        background: '#FFF5E6',
                        backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                        backgroundSize: '4px 4px'
                      }} title={playerName || ""}>
                        {playerName ? truncateText(playerName, 15) : "-"}
                      </td>
                      <td className="hidden md:table-cell" style={{
                        padding: '8px',
                        background: '#FFF5E6',
                        backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                        backgroundSize: '4px 4px'
                      }} title={counterparty || ""}>
                        {counterparty ? truncateText(counterparty, 15) : "-"}
                      </td>
                      <td style={{
                        padding: '8px',
                        whiteSpace: 'nowrap',
                        background: '#FFF5E6',
                        backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                        backgroundSize: '4px 4px'
                      }}>{t.position || "-"}</td>
                      <td style={{
                        padding: '8px',
                        whiteSpace: 'nowrap',
                        textAlign: 'right',
                        background: '#FFF5E6',
                        backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                        backgroundSize: '4px 4px'
                      }}>{t.age != null ? t.age : "-"}</td>
                      <td style={{
                        padding: '8px',
                        whiteSpace: 'nowrap',
                        textAlign: 'right',
                        fontWeight: '600',
                        background: '#FFF5E6',
                        backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
                        backgroundSize: '4px 4px',
                        color: isLoss ? '#B85450' : '#2F7A56'
                      }}>
                        {fee != null ? formatCurrencyAmount(feeCurrency || activeCurrency, fee) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        )}
      </div>
    );
  };

  const backgroundColor = homeBgColor ? lightenColor(homeBgColor, 80) : '#FFF5E6';

  return (
    <main className={inter.className} style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: backgroundColor,
      backgroundImage: 'radial-gradient(circle, #241C1512 1px, transparent 1.2px)',
      backgroundSize: '4px 4px'
    }}>
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} headerBackgroundColor={homeBgColor} />
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;500;600;700&family=IBM+Plex+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      <div style={{
        maxWidth: '820px',
        margin: '0 auto',
        padding: '48px 6vw 80px'
      }}>
        {/* Page Head */}
        <div className="page-head" style={{
          borderBottom: '2px solid #0B1410',
          paddingBottom: '16px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'flex-end'
        }}>
          <h1 style={{
            fontFamily: 'Anton, sans-serif',
            fontWeight: 400,
            fontSize: 'clamp(26px, 4vw, 38px)',
            color: '#0B1410'
          }}>
            移籍履歴
          </h1>
          <p style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 400,
            fontSize: '12px',
            letterSpacing: '0.04em',
            color: '#0B1410',
            marginLeft: 'auto'
          }}>
            TRANSFER HISTORY
          </p>
        </div>

        {/* Season Dropdown */}
        {seasons.length > 1 && (
          <div style={{ marginBottom: '32px' }}>
            <label style={{
              fontFamily: 'Oswald, sans-serif',
              fontSize: '12px',
              color: '#0B1410',
              marginRight: '12px'
            }}>
              シーズン
            </label>
            <SeasonDropdown seasons={seasons} activeSeason={activeSeason} />
          </div>
        )}

        {/* Balance Card */}
        <div className="balance-card" style={{
          padding: '32px',
          marginBottom: '32px',
          borderRadius: '4px'
        }}>
          <div className="balance-title" style={{
            fontFamily: 'Oswald, sans-serif',
            fontWeight: 600,
            fontSize: '15px',
            color: '#0B1410',
            marginBottom: '24px'
          }}>
            移籍収支（€）
          </div>
          <div className="donut-row" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '32px',
            flexWrap: 'wrap'
          }}>
            <div className="donut" style={{
              position: 'relative',
              width: '220px',
              height: '220px',
              borderRadius: '50%',
              background: `conic-gradient(#B85450 0% ${inPercentage}%, #2F7A56 ${inPercentage}% 100%)`
            }}>
              <div className="donut-center" style={{
                position: 'absolute',
                inset: '34px',
                borderRadius: '50%',
                background: '#F4F2E8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{
                  fontFamily: 'Oswald, sans-serif',
                  fontWeight: 400,
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  color: '#0B1410b3',
                  marginBottom: '4px'
                }}>
                  収支
                </span>
                <span className="val" style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 700,
                  fontSize: '24px',
                  color: balanceTotal >= 0 ? '#2F7A56' : '#B85450'
                }}>
                  {balanceTotal >= 0 ? '+' : ''}{formatCurrencyAmount(activeCurrency, balanceTotal)}
                </span>
              </div>
            </div>
            <div className="legend" style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#B85450'
                }}></div>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 400,
                  fontSize: '13px',
                  color: '#0B1410b3'
                }}>
                  IN
                </span>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#B85450',
                  marginLeft: 'auto'
                }}>
                  {formatCurrencyAmount(activeCurrency, inTotal)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#2F7A56'
                }}></div>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 400,
                  fontSize: '13px',
                  color: '#0B1410b3'
                }}>
                  OUT
                </span>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#2F7A56',
                  marginLeft: 'auto'
                }}>
                  {formatCurrencyAmount(activeCurrency, outTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Transfer Tables */}
        <div style={{ marginBottom: '32px' }}>
          <TransferTable rows={inTransfers} directionLabel="IN" />
        </div>
        <div style={{ marginBottom: '32px' }}>
          <TransferTable rows={outTransfers} directionLabel="OUT" />
        </div>

        {/* Legend Note */}
        <div className="legend-note" style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 400,
          fontSize: '11px',
          color: '#0B1410b3',
          borderTop: '1px solid #0B141033',
          paddingTop: '16px'
        }}>
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

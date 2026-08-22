import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';

import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import Image from "next/image";
import Link from "next/link";
import { FaXTwitter, FaYoutube, FaTiktok, FaInstagram } from "react-icons/fa6";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";

interface ClubInfoPageProps {
  params: { clubId: string };
}

interface ClubTitleItem {
  competitionName?: string;
  season?: string;
  seasons?: string[];
}

async function getClubInfo(clubId: string) {
  const resolved = await resolvePublicClubProfile(clubId);
  if (!resolved) return null;
  if (resolved.displaySettings.menuShowClub === false) return null;
  return { ...(resolved.profileData as any), ownerUid: resolved.ownerUid };
}

export default async function ClubInfoPage({ params }: ClubInfoPageProps) {
  const clubId = params.clubId;

  // Prevent this route from handling '/admin' paths
  if (clubId === 'admin') {
    notFound();
  }

  const clubInfo = await getClubInfo(clubId);

  if (!clubInfo) {
    notFound();
  }

  const parseSeasonStart = (season: string) => {
    const match = String(season).match(/^(\d{4})/);
    return match ? Number(match[1]) : 9999;
  };

  const groupedTitles = Array.from(
    (Array.isArray((clubInfo as any).clubTitles) ? ((clubInfo as any).clubTitles as ClubTitleItem[]) : [])
      .reduce((acc, t) => {
        const competitionName = typeof t?.competitionName === 'string' ? t.competitionName : '';
        const seasons = Array.isArray((t as any)?.seasons)
          ? ((t as any).seasons as any[]).map((s) => (typeof s === 'string' ? s : '')).filter((s) => s.length > 0)
          : typeof t?.season === 'string'
            ? [t.season]
            : [];
        if (competitionName.length === 0 && seasons.length === 0) return acc;
        const current = acc.get(competitionName) || { competitionName, seasons: [] as string[] };
        for (const season of seasons) {
          if (!current.seasons.includes(season)) current.seasons.push(season);
        }
        acc.set(competitionName, current);
        return acc;
      }, new Map<string, { competitionName: string; seasons: string[] }>())
      .values()
  ).map((g) => ({
    ...g,
    seasons: g.seasons.sort((a, b) => parseSeasonStart(a) - parseSeasonStart(b) || String(a).localeCompare(String(b))),
  }));

  const foundedYear = (clubInfo as any).foundedYear as string | undefined;
  const hometown = (clubInfo as any).hometown as string | undefined;
  const stadiumName = (clubInfo as any).stadiumName as string | undefined;
  const stadiumCapacity = (clubInfo as any).stadiumCapacity as string | undefined;
  const stadiumPhotoUrl = (clubInfo as any).stadiumPhotoUrl as string | undefined;
  const clubDescription = (clubInfo as any).clubDescription as string | undefined;

  const clubName = (clubInfo as any).clubName as string | undefined;
  const logoUrl = ((clubInfo as any).logoUrl as string | null | undefined) ?? null;
  const snsLinks = ((clubInfo as any).snsLinks as any) ?? {};
  const sponsors = (Array.isArray((clubInfo as any).sponsors) ? ((clubInfo as any).sponsors as any[]) : []) as any;
  const legalPages = (Array.isArray((clubInfo as any).legalPages) ? ((clubInfo as any).legalPages as any[]) : []) as any;
  const homeBgColor = (clubInfo as any).homeBgColor as string | undefined;
  const accentColor = homeBgColor || '#dc143c';
  const gameTeamUsage = Boolean((clubInfo as any).gameTeamUsage);
  const statCards = [
    { label: '創立', value: foundedYear && foundedYear.length > 0 ? foundedYear : '-' },
    { label: 'ホームタウン', value: hometown && hometown.length > 0 ? hometown : '-' },
    { label: 'スタジアム', value: stadiumName && stadiumName.length > 0 ? stadiumName : '-' },
    { label: '収容人数', value: stadiumCapacity && stadiumCapacity.length > 0 ? `${stadiumCapacity}人` : '-' },
  ];

  return (
    <main className="min-h-screen flex flex-col bg-[#05080f] text-white">
      <ClubHeader clubId={clubId} clubName={clubName || ''} logoUrl={logoUrl} snsLinks={snsLinks} headerBackgroundColor={accentColor} />

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 opacity-25" style={{ background: `radial-gradient(circle at 18% 0%, ${accentColor} 0%, transparent 34%), linear-gradient(180deg, ${accentColor} 0%, #05080f 35%, #05080f 100%)` }} />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)', backgroundSize: '96px 96px' }} />
        {stadiumPhotoUrl && stadiumPhotoUrl.length > 0 ? (
          <div className="pointer-events-none absolute right-0 top-28 h-[240px] w-[92vw] overflow-hidden opacity-20 mix-blend-screen lg:top-24 lg:h-[360px] lg:w-[54vw] lg:opacity-30">
            <Image
              src={stadiumPhotoUrl}
              alt={stadiumName || 'Stadium'}
              fill
              className="object-cover [mask-image:linear-gradient(90deg,transparent_0%,black_40%,black_70%,transparent_100%)] lg:[mask-image:linear-gradient(90deg,transparent,black_28%,black_78%,transparent)]"
              sizes="(max-width: 1024px) 92vw, 54vw"
            />
          </div>
        ) : null}

        <div className="relative mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-4 text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: accentColor }}>Club・Profile</div>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white p-2 shadow-lg shadow-black/30">
                    <Image src={logoUrl} alt={clubName || 'Club logo'} width={56} height={56} className="object-contain" />
                  </div>
                ) : null}
                <h1 className="max-w-[720px] text-5xl font-black leading-[0.95] tracking-[-0.06em] sm:text-7xl">{clubName}</h1>
              </div>
            </div>

            {snsLinks && (snsLinks.x || snsLinks.youtube || snsLinks.tiktok || snsLinks.instagram) && (
              <div className="flex flex-wrap items-center gap-3 lg:pb-3">
                {snsLinks.youtube && (
                  <Link href={snsLinks.youtube} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20" aria-label="YouTube">
                    <FaYoutube className="h-4 w-4" />
                  </Link>
                )}
                {snsLinks.x && (
                  <Link href={snsLinks.x} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20" aria-label="X">
                    <FaXTwitter className="h-4 w-4" />
                  </Link>
                )}
                {snsLinks.tiktok && (
                  <Link href={snsLinks.tiktok} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20" aria-label="TikTok">
                    <FaTiktok className="h-4 w-4" />
                  </Link>
                )}
                {snsLinks.instagram && (
                  <Link href={snsLinks.instagram} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20" aria-label="Instagram">
                    <FaInstagram className="h-4 w-4" />
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-slate-900/75 p-4 shadow-xl shadow-black/10 backdrop-blur">
                <div className="text-[11px] font-bold text-slate-400">{item.label}</div>
                <div className="mt-2 text-lg font-black tracking-[-0.04em] text-white">{item.value}</div>
              </div>
            ))}
          </div>

          {clubDescription && clubDescription.trim().length > 0 ? (
            <section className="mt-9 rounded-xl border border-white/10 bg-slate-900/75 p-5 shadow-xl shadow-black/10 backdrop-blur" style={{ borderLeftColor: accentColor, borderLeftWidth: 4 }}>
              <div className="mb-3 text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: accentColor }}>About</div>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{clubDescription}</p>
            </section>
          ) : null}

          {groupedTitles.length > 0 && (
            <section className="mt-12">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-px w-8" style={{ backgroundColor: accentColor }} />
                <h2 className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: accentColor }}>Honours</h2>
                <div className="font-mono text-2xl font-black text-white/15">{groupedTitles.length}</div>
              </div>

              <div className="space-y-3">
                {groupedTitles.map((title) => (
                  <div key={title.competitionName} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900/75 px-4 py-4 shadow-xl shadow-black/10 backdrop-blur">
                    <div>
                      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: accentColor }}>Title</div>
                      <div className="text-sm font-black text-white sm:text-base">{title.competitionName || '-'}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {title.seasons.length > 0 ? (
                        title.seasons.map((season) => (
                          <div key={season} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 font-mono text-[11px] font-black" style={{ color: accentColor }}>
                            {season}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 font-mono text-[11px] font-black" style={{ color: accentColor }}>
                          -
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <PartnerStripClient clubId={clubId} />
      <ClubFooter
        clubId={clubId}
        clubName={clubName || ''}
        sponsors={sponsors}
        snsLinks={snsLinks}
        legalPages={legalPages}
        gameTeamUsage={Boolean(gameTeamUsage)}
      />
    </main>
  );
}

import { notFound } from "next/navigation";
import Image from "next/image";

import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import { TrophyRoomViewTracker } from "@/components/trophy-room-view-tracker";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";
import { fetchDisplayTrophies } from "@/lib/trophies-server";
import { sortSeasonsAsc, trophyImageSrc, TROPHY_ROOM_BG } from "@/lib/trophies";
import { Trophy } from "lucide-react";

export const metadata = {
  title: "トロフィールーム",
};

export const dynamic = "force-dynamic";

interface TrophyRoomPageProps {
  params: Promise<{ clubId: string }>;
}

export default async function TrophyRoomPage({ params }: TrophyRoomPageProps) {
  const { clubId } = await params;

  if (clubId === "admin") {
    notFound();
  }

  const resolved = await resolvePublicClubProfile(clubId);
  if (!resolved) {
    notFound();
  }

  const clubUid = resolved.clubUid;
  const profile = resolved.profileData as Record<string, any>;
  const trophies = await fetchDisplayTrophies(clubUid);

  const clubName = (profile.clubName as string | undefined) ?? "";
  const logoUrl = ((profile.logoUrl as string | null | undefined) ?? null) as string | null;
  const snsLinks = profile.snsLinks ?? {};
  const sponsors = Array.isArray(profile.sponsors) ? profile.sponsors : [];
  const legalPages = Array.isArray(profile.legalPages) ? profile.legalPages : [];
  const gameTeamUsage = Boolean(profile.gameTeamUsage);
  const accentColor = (profile.homeBgColor as string | undefined) || "#dc143c";

  const totalWins = trophies.reduce((sum, t) => sum + t.winningSeasons.length, 0);
  const topTitle = trophies.length > 0
    ? trophies.reduce((top, t) => (t.winningSeasons.length > top.winningSeasons.length ? t : top), trophies[0])
    : null;

  const summaryStats = [
    { label: "総タイトル数", value: String(totalWins) },
    { label: "タイトル種類", value: String(trophies.length) },
    { label: "最多獲得", value: topTitle ? `${topTitle.titleName}` : "-" },
  ];

  return (
    <main className="flex min-h-screen flex-col bg-[#05080f] text-white">
      <TrophyRoomViewTracker clubUid={clubUid} clubProfileId={resolved.profileDocId} />
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} headerBackgroundColor={accentColor} />

      <section className="relative overflow-hidden">
        <Image src={TROPHY_ROOM_BG} alt="" fill priority className="object-cover object-right" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#05080f] via-[#05080f]/75 to-[#05080f]/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05080f] via-transparent to-transparent" />
        <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-10 pt-14 sm:px-8 sm:pb-14 sm:pt-20">
          <div className="flex items-center gap-3">
            <div className="h-px w-8" style={{ backgroundColor: accentColor }} />
            <span className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: accentColor }}>{clubName}</span>
          </div>
          <h1 className="mt-4 text-5xl font-black leading-[0.95] tracking-[-0.06em] sm:text-7xl">TROPHY ROOM</h1>
          <p className="mt-3 text-sm font-bold text-slate-300 sm:text-base">クラブが積み重ねてきた栄光の記録</p>

          <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-3 lg:max-w-2xl">
            {summaryStats.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-slate-900/75 px-3 py-3 backdrop-blur sm:px-4 sm:py-4">
                <div className="text-[10px] font-bold text-slate-400 sm:text-[11px]">{s.label}</div>
                <div className="mt-1.5 truncate text-lg font-black tracking-[-0.02em] text-white sm:text-2xl" style={s.label === "最多獲得" ? { color: accentColor } : undefined}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl flex-1 px-5 pb-12 pt-8 sm:px-8">
        {trophies.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-white/10 bg-slate-900/60 px-6 py-16 text-center">
            <Trophy className="h-10 w-10 text-white/25" />
            <p className="mt-4 text-sm font-black text-white">まだタイトルが登録されていません</p>
            <p className="mt-1 text-xs font-bold text-white/50">タイトルが登録されると、ここにクラブの栄光の記録が表示されます。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {trophies.map((t) => (
              <article key={t.id} className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/75 shadow-xl shadow-black/10 backdrop-blur">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
                  <Image src={trophyImageSrc(t.trophyImageKey)} alt={t.titleName} fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                  <div className="absolute bottom-2 right-3 rounded-full border border-white/15 bg-black/55 px-2.5 py-0.5 text-[11px] font-black" style={{ color: accentColor }}>
                    {t.winningSeasons.length}回獲得
                  </div>
                </div>
                <div className="p-4">
                  <h2 className="truncate text-sm font-black text-white sm:text-base">{t.titleName}</h2>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {sortSeasonsAsc(t.winningSeasons).map((s) => (
                      <span key={s} className="rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 font-mono text-[11px] font-black" style={{ color: accentColor }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <PartnerStripClient clubId={clubId} />
      <ClubFooter
        clubId={clubId}
        clubName={clubName || ""}
        sponsors={sponsors}
        snsLinks={snsLinks}
        legalPages={legalPages}
        gameTeamUsage={gameTeamUsage}
      />
    </main>
  );
}

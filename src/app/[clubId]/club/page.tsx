import { db, getOwnerUidByClubId } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';

import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import Image from "next/image";
import Link from "next/link";
import { FaXTwitter, FaYoutube, FaTiktok, FaInstagram } from "react-icons/fa6";
import { Button } from "@/components/ui/button";

interface ClubInfoPageProps {
  params: { clubId: string };
}

interface ClubTitleItem {
  competitionName?: string;
  season?: string;
  seasons?: string[];
}

async function getClubInfo(clubId: string) {
  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  if (!profilesSnap.empty) {
    const doc = profilesSnap.docs[0];
    return { ...(doc.data() as any), ownerUid: (doc.data() as any)?.ownerUid || doc.id };
  }

  // fallback: allow accessing by direct doc id (ownerUid) or by ownerUid field
  const direct = await db.collection('club_profiles').doc(clubId).get();
  if (direct.exists) {
    const data = direct.data() as any;
    return { ...data, ownerUid: data?.ownerUid || direct.id };
  }

  const ownerSnap = await db.collection('club_profiles').where('ownerUid', '==', clubId).limit(1).get();
  if (!ownerSnap.empty) {
    const doc = ownerSnap.docs[0];
    return { ...(doc.data() as any), ownerUid: (doc.data() as any)?.ownerUid || doc.id };
  }

  return null;
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

  const titles = (Array.isArray((clubInfo as any).clubTitles) ? ((clubInfo as any).clubTitles as ClubTitleItem[]) : [])
    .map((t) => ({
      competitionName: typeof t?.competitionName === 'string' ? t.competitionName : '',
      seasons: Array.isArray((t as any)?.seasons)
        ? ((t as any).seasons as any[]).map((s) => (typeof s === 'string' ? s : '')).filter((s) => s.length > 0)
        : typeof t?.season === 'string'
          ? [t.season]
          : [],
    }))
    .filter((t) => t.competitionName.length > 0 || (Array.isArray(t.seasons) && t.seasons.length > 0));

  const groupedTitles = Array.from(
    titles.reduce((acc, t) => {
      const key = t.competitionName || '-';
      const next = acc.get(key) || { competitionName: key, seasons: [] as string[] };
      for (const s of (t.seasons || [])) {
        if (s && s.length > 0 && !next.seasons.includes(s)) next.seasons.push(s);
      }
      acc.set(key, next);
      return acc;
    }, new Map<string, { competitionName: string; seasons: string[] }>())
      .values()
  ).map((g) => ({
    ...g,
    seasons: g.seasons.sort((a, b) => String(b).localeCompare(String(a))),
  }));

  const foundedYear = (clubInfo as any).foundedYear as string | undefined;
  const hometown = (clubInfo as any).hometown as string | undefined;
  const stadiumName = (clubInfo as any).stadiumName as string | undefined;
  const stadiumCapacity = (clubInfo as any).stadiumCapacity as string | undefined;
  const stadiumPhotoUrl = (clubInfo as any).stadiumPhotoUrl as string | undefined;

  const clubName = (clubInfo as any).clubName as string | undefined;
  const logoUrl = ((clubInfo as any).logoUrl as string | null | undefined) ?? null;
  const snsLinks = ((clubInfo as any).snsLinks as any) ?? {};
  const sponsors = (Array.isArray((clubInfo as any).sponsors) ? ((clubInfo as any).sponsors as any[]) : []) as any;
  const legalPages = (Array.isArray((clubInfo as any).legalPages) ? ((clubInfo as any).legalPages as any[]) : []) as any;
  const homeBgColor = (clubInfo as any).homeBgColor as string | undefined;
  const gameTeamUsage = Boolean((clubInfo as any).gameTeamUsage);

  return (
    <main className="min-h-screen flex flex-col" style={homeBgColor ? { backgroundColor: homeBgColor } : undefined}>
      <ClubHeader clubId={clubId} clubName={clubName || ''} logoUrl={logoUrl} snsLinks={snsLinks} />

      <div className="flex-1 w-full">
        <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="text-3xl font-bold text-white">{clubName}</h1>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            {stadiumPhotoUrl && stadiumPhotoUrl.length > 0 ? (
              <div className="overflow-hidden rounded-lg border bg-white/60">
                <div className="relative w-full h-[220px] sm:h-[280px] md:h-[320px] lg:h-[360px]">
                  <Image
                    src={stadiumPhotoUrl}
                    alt={stadiumName || "Stadium"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {snsLinks && (snsLinks.x || snsLinks.youtube || snsLinks.tiktok || snsLinks.instagram) && (
              <div className="flex flex-wrap items-center gap-3">
                {snsLinks.youtube && (
                  <Link
                    href={snsLinks.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-white/60 border flex items-center justify-center hover:bg-white/80 transition-colors"
                    aria-label="YouTube"
                  >
                    <FaYoutube className="w-5 h-5" />
                  </Link>
                )}
                {snsLinks.x && (
                  <Link
                    href={snsLinks.x}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-white/60 border flex items-center justify-center hover:bg-white/80 transition-colors"
                    aria-label="X"
                  >
                    <FaXTwitter className="w-4 h-4" />
                  </Link>
                )}
                {snsLinks.tiktok && (
                  <Link
                    href={snsLinks.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-white/60 border flex items-center justify-center hover:bg-white/80 transition-colors"
                    aria-label="TikTok"
                  >
                    <FaTiktok className="w-4 h-4" />
                  </Link>
                )}
                {snsLinks.instagram && (
                  <Link
                    href={snsLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-white/60 border flex items-center justify-center hover:bg-white/80 transition-colors"
                    aria-label="Instagram"
                  >
                    <FaInstagram className="w-4 h-4" />
                  </Link>
                )}
              </div>
            )}

            <div>
              <Button asChild variant="outline" className="bg-white/60 hover:bg-white/80">
                <Link href={`/${clubId}/transfers`}>移籍履歴</Link>
              </Button>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border bg-white/60 p-4">
                <div className="text-xs text-muted-foreground">創立</div>
                <div className="mt-1 text-base font-medium">{foundedYear && foundedYear.length > 0 ? foundedYear : '-'}</div>
              </div>
              <div className="rounded-lg border bg-white/60 p-4">
                <div className="text-xs text-muted-foreground">ホームタウン</div>
                <div className="mt-1 text-base font-medium">{hometown && hometown.length > 0 ? hometown : '-'}</div>
              </div>
              <div className="rounded-lg border bg-white/60 p-4">
                <div className="text-xs text-muted-foreground">スタジアム名</div>
                <div className="mt-1 text-base font-medium">{stadiumName && stadiumName.length > 0 ? stadiumName : '-'}</div>
              </div>
              <div className="rounded-lg border bg-white/60 p-4">
                <div className="text-xs text-muted-foreground">収容人数</div>
                <div className="mt-1 text-base font-medium">{stadiumCapacity && stadiumCapacity.length > 0 ? stadiumCapacity : '-'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold text-white">獲得タイトル</h2>
          {groupedTitles.length === 0 ? (
            <p className="mt-2 text-sm text-white/80">登録されたタイトルはありません。</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border bg-white/60">
              <div className="grid grid-cols-[1fr,7rem] gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
                <div>大会名</div>
                <div>シーズン</div>
              </div>
              <div className="divide-y">
                {groupedTitles.map((t) => (
                  <div key={t.competitionName} className="grid grid-cols-[1fr,7rem] gap-2 px-4 py-3 text-sm">
                    <div className="font-medium">{t.competitionName || '-'}</div>
                    <div>{t.seasons.length > 0 ? t.seasons.join(',') : '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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

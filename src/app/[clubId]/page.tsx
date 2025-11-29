import ClubPageContent from './ClubPageContent';

interface ClubPageProps {
  params: Promise<{ clubId: string }>;
}

export default async function ClubPage({ params }: ClubPageProps) {
  const { clubId } = await params;
  return <ClubPageContent clubId={clubId} />;
}

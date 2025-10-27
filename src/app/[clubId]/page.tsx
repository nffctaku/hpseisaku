import ClubPageContent from './ClubPageContent';

interface ClubPageProps {
  params: { clubId: string };
}

export default async function ClubPage({ params }: ClubPageProps) {
  return <ClubPageContent clubId={params.clubId} />;
}

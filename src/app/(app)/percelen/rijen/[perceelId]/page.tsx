import { RijenkaartDetailClient } from './client-page';

export default async function RijenkaartDetailPage({ params }: { params: Promise<{ perceelId: string }> }) {
  const { perceelId } = await params;
  return <RijenkaartDetailClient perceelId={perceelId} />;
}

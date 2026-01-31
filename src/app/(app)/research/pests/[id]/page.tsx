import { PestDetailClient } from "./client-page";

export default async function PestDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <PestDetailClient id={id} />;
}

import { redirect } from 'next/navigation';

export default async function ProductRedirect({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/gewasbescherming/database/${id}`);
}

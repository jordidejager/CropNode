import { getCtgbProductByNumber } from '@/lib/supabase-store';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { MiddelDetailClient } from './middel-detail-client';

export default async function MiddelDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const middel = await getCtgbProductByNumber(id);

    if (!middel) {
        return (
            <div className="max-w-5xl mx-auto p-4 md:p-8">
                <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="p-8 text-center">
                        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                        <p className="text-white font-bold">Product niet gevonden</p>
                        <p className="text-white/40 text-sm mt-1">Toelatingsnummer {id} bestaat niet in de database.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return <MiddelDetailClient middel={middel} />;
}

import { Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CardTitle, CardDescription } from '@/components/ui/card';

export default function DeliveriesPage() {
    return (
        <div className="space-y-6">
            <div>
                <CardTitle>Afleveroverzicht</CardTitle>
                <CardDescription>Overzicht van al je afleveringen en afnemers.</CardDescription>
            </div>

            <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                        <Truck className="h-8 w-8 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md">
                        Overzicht van afleveringen aan veiling, coöperatie of afnemers.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

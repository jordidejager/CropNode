'use client';

import { BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CardTitle, CardDescription } from '@/components/ui/card';

export default function FieldAnalysisPage() {
    return (
        <div className="space-y-6">
            <div>
                <CardTitle>Perceelanalyse</CardTitle>
                <CardDescription>Analyseer opbrengsten en trends per perceel.</CardDescription>
            </div>

            <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                        <BarChart3 className="h-8 w-8 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md">
                        Vergelijk opbrengsten per perceel over seizoenen en ontdek correlaties met gewasbescherming.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getLogbookEntries } from '@/lib/store';
import { LogbookTable } from '@/components/logbook-table';

export const dynamic = 'force-dynamic';

export default function LogboekPage() {
  const entries = getLogbookEntries();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Logboek</h1>
        <p className="text-muted-foreground">Een chronologisch overzicht van alle ingevoerde bespuitingen.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Volledig Logboek</CardTitle>
          <CardDescription>Alle {entries.length} regels, met de nieuwste bovenaan.</CardDescription>
        </CardHeader>
        <CardContent>
          <LogbookTable entries={entries} />
        </CardContent>
      </Card>
    </div>
  );
}

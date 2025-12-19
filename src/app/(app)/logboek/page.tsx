import { getLogbookEntries } from '@/lib/store';
import { LogbookTable } from '@/components/logbook-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function LogboekPage() {
  const entries = getLogbookEntries();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Volledig Logboek</CardTitle>
        <CardDescription>Alle {entries.length} regels, met de nieuwste bovenaan.</CardDescription>
      </CardHeader>
      <CardContent>
        <LogbookTable entries={entries} />
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InvoerForm } from '@/components/invoer-form';
import { getLogbookEntries } from '@/lib/store';
import { LogbookTable } from '@/components/logbook-table';

export const dynamic = 'force-dynamic';

export default function InvoerPage() {
  const recentEntries = getLogbookEntries().slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Slimme Invoer</h1>
        <p className="text-muted-foreground">Voer je bespuitingen in met natuurlijke taal.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Nieuwe bespuiting</CardTitle>
            <CardDescription>
              Typ of spreek je bespuiting in. De AI analyseert de tekst, identificeert percelen en middelen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InvoerForm />
          </CardContent>
        </Card>
        
        <div className="lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle>Recente Invoer</CardTitle>
              <CardDescription>De laatste 5 ingevoerde regels.</CardDescription>
            </CardHeader>
            <CardContent>
              <LogbookTable entries={recentEntries} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

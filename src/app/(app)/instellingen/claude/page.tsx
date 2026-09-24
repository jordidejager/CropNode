'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Copy, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getKoppelsleutels, maakKoppelsleutel, trekKoppelsleutelIn, type Koppelsleutel } from '@/app/claude-koppeling-actions';

export default function ClaudeKoppelingPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sleutels, setSleutels] = useState<Koppelsleutel[]>([]);
  const [omschrijving, setOmschrijving] = useState('Claude op mijn telefoon');
  const [bezig, setBezig] = useState(false);
  const [nieuweUrl, setNieuweUrl] = useState<string | null>(null);
  const [intrekkenId, setIntrekkenId] = useState<string | null>(null);

  const herlaad = useCallback(async () => {
    try {
      setSleutels(await getKoppelsleutels());
    } catch (error) {
      toast({ variant: 'destructive', title: 'Laden mislukt', description: error instanceof Error ? error.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { herlaad(); }, [herlaad]);

  const maken = async () => {
    setBezig(true);
    try {
      const { url } = await maakKoppelsleutel(omschrijving);
      setNieuweUrl(url);
      await herlaad();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Aanmaken mislukt', description: error instanceof Error ? error.message : undefined });
    } finally {
      setBezig(false);
    }
  };

  const intrekken = async () => {
    if (!intrekkenId) return;
    setBezig(true);
    try {
      await trekKoppelsleutelIn(intrekkenId);
      toast({ title: 'Sleutel ingetrokken' });
      await herlaad();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Intrekken mislukt', description: error instanceof Error ? error.message : undefined });
    } finally {
      setBezig(false);
      setIntrekkenId(null);
    }
  };

  const kopieer = async () => {
    if (!nieuweUrl) return;
    try {
      await navigator.clipboard.writeText(nieuweUrl);
      toast({ title: 'Adres gekopieerd' });
    } catch {
      toast({ variant: 'destructive', title: 'Kopiëren mislukt', description: 'Selecteer het adres en kopieer het handmatig.' });
    }
  };

  const actief = sleutels.filter(s => !s.ingetrokkenOp);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Claude-koppeling</h1>
          <p className="text-sm text-white/50">Praat in Claude met je eigen CropNode-gegevens en leg er registraties in vast.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hoe werkt het?</CardTitle>
          <CardDescription>
            Met een koppelsleutel kan een Claude-chat (telefoon of computer) je spuitschrift, percelen, voorraad, weer en
            veldnotities opvragen én registraties doen: &ldquo;busje en jachthoek oude gespoten met merpan 1,5 kg en soriale 0,5&rdquo;.
            Claude legt bij registreren altijd eerst een voorstel voor; pas na jouw &ldquo;ja&rdquo; wordt het opgeslagen.
            De sleutel geeft alleen toegang tot jouw eigen gegevens en is hier altijd in te trekken.
          </CardDescription>
        </CardHeader>
      </Card>

      {nieuweUrl && (
        <Card className="border-emerald-500/40">
          <CardHeader>
            <CardTitle className="text-base">Nieuwe koppeling — dit adres zie je maar één keer</CardTitle>
            <CardDescription>Plak dit adres als custom connector in Claude.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <code className="block break-all rounded-xl bg-white/5 px-4 py-3 text-sm text-emerald-200">{nieuweUrl}</code>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={kopieer} className="h-11"><Copy className="h-4 w-4 mr-2" /> Kopieer adres</Button>
              <Button variant="ghost" onClick={() => setNieuweUrl(null)} className="h-11">Verbergen</Button>
            </div>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-white/60">
              <li><strong className="text-white/80">Claude-app / claude.ai</strong>: Instellingen → Connectors → &ldquo;Add custom connector&rdquo; → naam <em>CropNode</em>, adres hierboven plakken → toevoegen. Zet de connector aan in een nieuwe chat (naast StoreNode).</li>
              <li><strong className="text-white/80">Claude Code</strong>: <code className="text-emerald-200">claude mcp add --transport http cropnode &quot;&lt;adres&gt;&quot;</code></li>
              <li>Vraag dan bijvoorbeeld: &ldquo;Welke percelen heb ik de laatste 2 weken niet met captan gedaan?&rdquo;, &ldquo;Wat is de voorraad Merpan?&rdquo; of &ldquo;Registreer: busje en jachthoek oude met merpan 1,5 kg&rdquo;.</li>
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nieuwe koppelsleutel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="omschrijving">Omschrijving</Label>
            <Input id="omschrijving" value={omschrijving} onChange={e => setOmschrijving(e.target.value)} className="h-11" placeholder="Bijv. Claude op mijn telefoon" />
          </div>
          <Button onClick={maken} disabled={bezig} className="h-11">
            {bezig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Sleutel aanmaken
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actieve sleutels</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          ) : actief.length === 0 ? (
            <p className="text-sm text-white/40">Nog geen actieve koppelsleutels.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {actief.map(s => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/90 truncate">{s.omschrijving}</p>
                    <p className="text-xs text-white/40">
                      Aangemaakt {format(new Date(s.createdAt), 'd MMM yyyy', { locale: nl })}
                      {s.laatstGebruiktOp ? ` · laatst gebruikt ${format(new Date(s.laatstGebruiktOp), 'd MMM HH:mm', { locale: nl })}` : ' · nog niet gebruikt'}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive" onClick={() => setIntrekkenId(s.id)} disabled={bezig} title="Intrekken">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!intrekkenId} onOpenChange={open => !open && setIntrekkenId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Koppelsleutel intrekken?</AlertDialogTitle>
            <AlertDialogDescription>De Claude-chat die deze sleutel gebruikt kan daarna niet meer bij je gegevens.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={intrekken} className="bg-destructive hover:bg-destructive/90">Intrekken</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

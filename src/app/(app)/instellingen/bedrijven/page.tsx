'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, Loader2, Plus, Save, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompanies, useInvalidateQueries } from '@/hooks/use-data';
import { addCompany, countParcelsForCompany, deleteCompany, setDefaultCompany, updateCompany, type CompanyInput } from '@/lib/companies';
import type { Company } from '@/lib/types';

const EMPTY: CompanyInput = { name: '', address: '', postalCode: '', city: '', country: 'NL', ggn: '', gln: '', growerNumber: '', kvk: '' };

const FIELDS: Array<{ key: keyof CompanyInput; label: string; placeholder?: string; wide?: boolean; inputMode?: 'numeric' }> = [
  { key: 'name', label: 'Bedrijfsnaam', placeholder: 'Bijv. Maatschap De Jager', wide: true },
  { key: 'address', label: 'Adres', placeholder: 'Straat en huisnummer', wide: true },
  { key: 'postalCode', label: 'Postcode', placeholder: '1234 AB' },
  { key: 'city', label: 'Plaats' },
  { key: 'ggn', label: 'GGN (GlobalG.A.P.)', inputMode: 'numeric' },
  { key: 'gln', label: 'GLN', inputMode: 'numeric' },
  { key: 'growerNumber', label: 'Telernummer (coöperatie)' },
  { key: 'kvk', label: 'KvK-nummer', inputMode: 'numeric' },
];

function toInput(c: Company): CompanyInput {
  return { name: c.name, address: c.address, postalCode: c.postalCode, city: c.city, country: c.country, ggn: c.ggn, gln: c.gln, growerNumber: c.growerNumber, kvk: c.kvk };
}

function CompanyFields({ value, onChange, idPrefix }: { value: CompanyInput; onChange: (v: CompanyInput) => void; idPrefix: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {FIELDS.map(f => (
        <div key={f.key} className={f.wide ? 'sm:col-span-2 space-y-2' : 'space-y-2'}>
          <Label htmlFor={`${idPrefix}-${f.key}`}>{f.label}</Label>
          <Input
            id={`${idPrefix}-${f.key}`}
            value={value[f.key]}
            placeholder={f.placeholder}
            inputMode={f.inputMode}
            onChange={e => onChange({ ...value, [f.key]: e.target.value })}
            className="h-11"
          />
        </div>
      ))}
    </div>
  );
}

function CompanyCard({ company, isOnly, onChanged }: { company: Company; isOnly: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<CompanyInput>(toInput(company));
  const [busy, setBusy] = useState<'save' | 'default' | 'delete' | null>(null);
  const [deleteState, setDeleteState] = useState<{ open: boolean; parcels: number }>({ open: false, parcels: 0 });

  useEffect(() => { setForm(toInput(company)); }, [company]);

  const dirty = JSON.stringify(form) !== JSON.stringify(toInput(company));

  const run = async (kind: 'save' | 'default' | 'delete', fn: () => Promise<void>, ok: string) => {
    setBusy(kind);
    try {
      await fn();
      toast({ title: ok });
      onChanged();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Mislukt', description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const askDelete = async () => {
    try {
      const n = await countParcelsForCompany(company);
      setDeleteState({ open: true, parcels: n });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Mislukt', description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <Card className={company.isDefault ? 'border-emerald-500/30' : undefined}>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <Building2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {company.name}
            {company.isDefault && !isOnly && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">Standaard</Badge>}
          </CardTitle>
          {company.isDefault && !isOnly && (
            <CardDescription>Percelen zonder gekozen bedrijf horen bij dit bedrijf.</CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <CompanyFields value={form} onChange={setForm} idPrefix={company.id} />
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/[0.06]">
          <Button className="h-11" disabled={!dirty || busy !== null} onClick={() => run('save', () => updateCompany(company.id, form), 'Bedrijf opgeslagen')}>
            {busy === 'save' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Opslaan
          </Button>
          {!company.isDefault && (
            <>
              <Button variant="outline" className="h-11" disabled={busy !== null} onClick={() => run('default', () => setDefaultCompany(company.id), `${company.name} is nu het standaardbedrijf`)}>
                {busy === 'default' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Star className="h-4 w-4 mr-2" />}
                Maak standaard
              </Button>
              <Button variant="outline" className="h-11 text-destructive hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10" disabled={busy !== null} onClick={askDelete}>
                <Trash2 className="h-4 w-4 mr-2" /> Verwijderen
              </Button>
            </>
          )}
        </div>
      </CardContent>

      <AlertDialog open={deleteState.open} onOpenChange={open => setDeleteState(s => ({ ...s, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{company.name} verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteState.parcels > 0
                ? `Er hangen nog ${deleteState.parcels} ${deleteState.parcels === 1 ? 'perceel' : 'percelen'} aan dit bedrijf. Die gaan dan naar het standaardbedrijf. Registraties blijven bewaard.`
                : 'Er hangen geen percelen aan dit bedrijf.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => run('delete', () => deleteCompany(company, deleteState.parcels > 0), 'Bedrijf verwijderd')}
            >
              {deleteState.parcels > 0 ? 'Percelen verplaatsen en verwijderen' : 'Verwijderen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function BedrijfsprofielenPage() {
  const { toast } = useToast();
  const { data: companies = [], isLoading, refetch } = useCompanies();
  const { invalidateCompanies, invalidateParcels } = useInvalidateQueries();
  const [adding, setAdding] = useState(false);
  const [newCompany, setNewCompany] = useState<CompanyInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const changed = () => {
    invalidateCompanies();
    invalidateParcels();
    refetch();
  };

  const create = async () => {
    setSaving(true);
    try {
      const defaults = companies.find(c => c.isDefault);
      await addCompany({
        ...newCompany,
        // Zelfde erf is de regel: adres overnemen als het leeg is gelaten.
        address: newCompany.address || defaults?.address || '',
        postalCode: newCompany.postalCode || defaults?.postalCode || '',
        city: newCompany.city || defaults?.city || '',
      });
      toast({ title: 'Bedrijf toegevoegd', description: 'Wijs nu bij Percelen de percelen aan dit bedrijf toe.' });
      setNewCompany(EMPTY);
      setAdding(false);
      changed();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Toevoegen mislukt', description: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/instellingen" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80">
        <ArrowLeft className="h-4 w-4" /> Instellingen
      </Link>
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Bedrijfsprofielen</h1>
          <p className="text-sm text-white/50">
            Bedrijfsgegevens voor stickers, certificering en afzet. Heb je meerdere bedrijven (bijv. een maatschap én een B.V.),
            dan kun je percelen per bedrijf scheiden.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      ) : (
        companies.map(c => <CompanyCard key={c.id} company={c} isOnly={companies.length === 1} onChanged={changed} />)
      )}

      {adding ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Nieuw bedrijf</CardTitle>
            <CardDescription>Adres leeg laten = zelfde adres als het standaardbedrijf.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <CompanyFields value={newCompany} onChange={setNewCompany} idPrefix="new" />
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/[0.06]">
              <Button className="h-11" disabled={!newCompany.name.trim() || saving} onClick={create}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Bedrijf toevoegen
              </Button>
              <Button variant="ghost" className="h-11" onClick={() => { setAdding(false); setNewCompany(EMPTY); }}>Annuleren</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        !isLoading && (
          <Button variant="outline" className="h-11" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-2" /> Bedrijf toevoegen
          </Button>
        )
      )}
    </div>
  );
}

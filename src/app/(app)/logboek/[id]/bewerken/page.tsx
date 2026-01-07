'use client';

import { useEffect, useState, useTransition, use } from 'react';
import { getLogbookEntry, getProducts, getParcels } from '@/lib/store';
import type { LogbookEntry, Parcel, ProductEntry } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { EditParcels } from '@/components/edit-parcels';
import { EditProducts } from '@/components/edit-products';
import { cn } from '@/lib/utils';
import { updateAndConfirmEntry } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function EditLogbookEntryPage({ params }: { params: { id: string } }) {
  const { id } = use(params);
  const [entry, setEntry] = useState<LogbookEntry | null>(null);
  const [originalProducts, setOriginalProducts] = useState<ProductEntry[]>([]);
  const [allProducts, setAllProducts] = useState<string[]>([]);
  const [allParcels, setAllParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConfirming, startConfirmTransition] = useTransition();

  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!db || !id) return;

    async function loadData() {
      setLoading(true);
      const [fetchedEntry, fetchedProducts, fetchedParcels] = await Promise.all([
        getLogbookEntry(db, id),
        getProducts(db),
        getParcels(db)
      ]);
      setEntry(fetchedEntry);
      if (fetchedEntry?.parsedData?.products) {
        setOriginalProducts(JSON.parse(JSON.stringify(fetchedEntry.parsedData.products)));
      }
      setAllProducts(fetchedProducts);
      setAllParcels(fetchedParcels);
      setLoading(false);
    }
    loadData();
  }, [db, id]);

  const handleParcelsChange = (selectedIds: string[]) => {
    if (entry && entry.parsedData) {
      setEntry({
        ...entry,
        parsedData: {
          ...entry.parsedData,
          plots: selectedIds,
        }
      });
    }
  };

  const handleProductsChange = (products: ProductEntry[]) => {
    if (entry && entry.parsedData) {
      setEntry({
        ...entry,
        parsedData: {
          ...entry.parsedData,
          products: products,
        }
      });
    }
  };

  const handleConfirm = () => {
    if (!entry) return;
    startConfirmTransition(async () => {
      const result = await updateAndConfirmEntry(entry, originalProducts);
      toast({
        title: result.entry?.status === 'Akkoord' ? 'Opgeslagen!' : 'Bijgewerkt',
        description: result.message,
      });
      router.push('/');
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
        <CardFooter className="justify-end gap-2">
           <Skeleton className="h-10 w-24" />
           <Skeleton className="h-10 w-24" />
        </CardFooter>
      </Card>
    );
  }

  if (!entry) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fout</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Logboek registratie niet gevonden.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Logboekregel Bewerken</CardTitle>
        <CardDescription>
          Pas de door de AI geanalyseerde gegevens aan en bevestig de bespuiting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {entry.parsedData ? (
          <>
            <EditProducts
              allProducts={allProducts}
              selectedProducts={entry.parsedData.products}
              onProductsChange={handleProductsChange}
            />
            <EditParcels
              allParcels={allParcels}
              selectedParcelIds={entry.parsedData.plots}
              onSelectionChange={handleParcelsChange}
            />
          </>
        ) : (
          <div className="text-center text-muted-foreground py-10">
            <p>Deze registratie bevat geen data die bewerkt kan worden.</p>
          </div>
        )}

        {entry.validationMessage && (
          <div className={cn("flex items-start gap-3 rounded-md border p-3 text-sm border-yellow-500/50 bg-yellow-500/10 text-yellow-200")}>
            <AlertTriangle className="size-5 mt-0.5" />
            <p className="flex-1">{entry.validationMessage}</p>
          </div>
        )}

      </CardContent>
      <CardFooter className="gap-2 justify-end flex-wrap">
        <Button variant="ghost" onClick={() => router.push('/')}>
          <X className="mr-2" /> Annuleren
        </Button>
        <Button onClick={handleConfirm} disabled={!entry.parsedData || isConfirming}>
            {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2"/>}
            Bevestigen en Opslaan
        </Button>
      </CardFooter>
    </Card>
  );
}

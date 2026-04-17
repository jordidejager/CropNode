'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useExtractSorteerrapport } from '@/hooks/use-data';
import { cn } from '@/lib/utils';

interface SorteerrapportUploadButtonProps {
    className?: string;
    variant?: 'default' | 'outline';
    compact?: boolean;
}

/**
 * Knop: upload een sorteerrapport PDF → AI maakt partij + events aan → redirect.
 * Geen preview, geen bevestiging. De gebruiker kan in de partij-detail pagina
 * alles nog aanpassen als de AI iets mis heeft.
 */
export function SorteerrapportUploadButton({
    className,
    variant = 'outline',
    compact = false,
}: SorteerrapportUploadButtonProps) {
    const router = useRouter();
    const { toast } = useToast();
    const extractMutation = useExtractSorteerrapport();
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handlePickFile = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Basic client-side validation (server re-checks)
        if (file.type !== 'application/pdf') {
            toast({
                title: 'Alleen PDF',
                description: 'Een sorteerrapport moet een PDF-bestand zijn.',
                variant: 'destructive',
            });
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast({
                title: 'Bestand te groot',
                description: 'Max 10 MB. Probeer een kleinere PDF.',
                variant: 'destructive',
            });
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        const loadingToast = toast({
            title: 'Sorteerrapport wordt gelezen…',
            description: 'AI extraheert de gegevens en maakt een partij aan. Dit duurt 5-15 seconden.',
        });

        try {
            const result = await extractMutation.mutateAsync(file);

            loadingToast.dismiss?.();

            const confidencePct = Math.round(result.confidence * 100);
            const details: string[] = [];
            if (result.label) details.push(result.label);
            if (result.totalKg) {
                details.push(`${result.totalKg.toLocaleString('nl-NL')} kg`);
            }
            if (result.totalRevenueEur) {
                details.push(`€${result.totalRevenueEur.toLocaleString('nl-NL')}`);
            }
            if (result.matchedParcel) {
                details.push(
                    `perceel: ${result.matchedParcel.subParcelName ?? result.matchedParcel.parcelName}`
                );
            } else {
                details.push('perceel niet gematcht');
            }

            toast({
                title: `Partij aangemaakt (AI-confidence ${confidencePct}%)`,
                description: details.join(' · '),
            });

            // Redirect naar de nieuwe partij zodat de gebruiker direct kan checken/aanpassen
            router.push(`/afzetstromen/${result.batchId}`);
        } catch (err) {
            loadingToast.dismiss?.();
            toast({
                title: 'Extractie mislukt',
                description: err instanceof Error ? err.message : 'Onbekende fout.',
                variant: 'destructive',
            });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const isPending = extractMutation.isPending;

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileSelected}
            />
            <Button
                type="button"
                variant={variant}
                onClick={handlePickFile}
                disabled={isPending}
                className={cn(
                    variant === 'outline' &&
                        'border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/50',
                    className,
                )}
            >
                {isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : compact ? (
                    <FileText className="h-4 w-4 mr-2" />
                ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isPending
                    ? 'AI extraheert…'
                    : compact
                      ? 'Sorteerrapport'
                      : 'Sorteerrapport uploaden'}
                {!isPending && !compact && (
                    <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                        AI
                    </span>
                )}
            </Button>
        </>
    );
}

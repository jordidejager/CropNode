"use client"

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getCtgbProductByNumber } from '@/lib/supabase-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    ChevronLeft,
    Sprout,
    TestTube,
    Factory,
    Calendar,
    Clock,
    Droplets,
    AlertTriangle,
    Shield,
    Leaf,
    Target,
    MapPin,
    RefreshCw,
    FileText,
    Beaker,
    TriangleAlert,
    Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CtgbCategoryBadge } from '@/components/ctgb-category-badge';
import type { CtgbGebruiksvoorschrift } from '@/lib/types';

export default function MiddelDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const { data: middel, isLoading, error } = useQuery({
        queryKey: ['ctgb-product', id],
        queryFn: () => getCtgbProductByNumber(id),
        staleTime: 5 * 60 * 1000,
    });

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Product laden...</p>
                </div>
            </div>
        );
    }

    if (error || !middel) {
        return (
            <div className="max-w-5xl mx-auto p-4 md:p-8">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="mb-6 text-white/60 hover:text-white"
                >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Terug
                </Button>
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

    const isValid = middel.status === 'Valid';
    const hardfruit = middel.gebruiksvoorschriften.filter(g =>
        g.gewas?.toLowerCase().includes('appel') ||
        g.gewas?.toLowerCase().includes('peer') ||
        g.gewas?.toLowerCase().includes('pitvruchten') ||
        g.gewas?.toLowerCase().includes('vruchtbomen')
    );

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            {/* Back Button */}
            <Button
                variant="ghost"
                onClick={() => router.back()}
                className="text-white/60 hover:text-white -ml-2"
            >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Terug naar overzicht
            </Button>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-white">{middel.naam}</h1>
                        <Badge
                            variant="outline"
                            className={cn(
                                "font-bold",
                                isValid
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "bg-red-500/10 text-red-400 border-red-500/20"
                            )}
                        >
                            {isValid ? 'Toegelaten' : 'Verlopen'}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-white/40 text-sm">
                        <span className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5" />
                            {middel.toelatingsnummer}
                        </span>
                        {middel.toelatingshouder && (
                            <span className="flex items-center gap-1.5">
                                <Factory className="h-3.5 w-3.5" />
                                {middel.toelatingshouder}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <CtgbCategoryBadge productTypes={middel.productTypes} />
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase mb-2">
                            <Beaker className="h-3.5 w-3.5" />
                            Werkzame stoffen
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {middel.werkzameStoffen.slice(0, 3).map(stof => (
                                <Badge key={stof} variant="secondary" className="bg-white/10 text-white/80 text-xs">
                                    {stof}
                                </Badge>
                            ))}
                            {middel.werkzameStoffen.length > 3 && (
                                <Badge variant="secondary" className="bg-white/5 text-white/40 text-xs">
                                    +{middel.werkzameStoffen.length - 3}
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase mb-2">
                            <Calendar className="h-3.5 w-3.5" />
                            Vervaldatum
                        </div>
                        <p className={cn(
                            "font-bold",
                            isValid ? "text-white" : "text-red-400"
                        )}>
                            {middel.vervaldatum ? new Date(middel.vervaldatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase mb-2">
                            <Sprout className="h-3.5 w-3.5" />
                            Hardfruit
                        </div>
                        <p className="font-bold text-white">
                            {hardfruit.length > 0 ? `${hardfruit.length} voorschriften` : 'Niet toegelaten'}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase mb-2">
                            <FileText className="h-3.5 w-3.5" />
                            Totaal
                        </div>
                        <p className="font-bold text-white">
                            {middel.gebruiksvoorschriften.length} voorschriften
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Samenstelling */}
            {middel.samenstelling && (
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-white flex items-center gap-2 text-lg">
                            <Beaker className="h-5 w-5 text-primary" />
                            Samenstelling
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {middel.samenstelling.formuleringstype && (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                    {middel.samenstelling.formuleringstype}
                                </Badge>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {middel.samenstelling.stoffen.map((stof, i) => (
                                    <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/5">
                                        <p className="font-bold text-white">{stof.naam}</p>
                                        <div className="flex items-center gap-3 text-sm text-white/40 mt-1">
                                            {stof.concentratie && <span>{stof.concentratie}</span>}
                                            {stof.casNummer && <span className="text-xs">CAS: {stof.casNummer}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Gebruiksvoorschriften Hardfruit */}
            {hardfruit.length > 0 && (
                <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-white flex items-center gap-2 text-lg">
                            <Leaf className="h-5 w-5 text-emerald-400" />
                            Gebruiksvoorschriften Hardfruit
                            <Badge className="ml-2 bg-emerald-500/20 text-emerald-400 border-0">
                                {hardfruit.length}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {hardfruit.map((voorschrift, index) => (
                                <GebruiksvoorschriftCard key={index} voorschrift={voorschrift} highlight />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Alle Gebruiksvoorschriften */}
            <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-3">
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                        <FileText className="h-5 w-5 text-primary" />
                        Alle Gebruiksvoorschriften
                        <Badge className="ml-2 bg-white/10 text-white/60 border-0">
                            {middel.gebruiksvoorschriften.length}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                        {middel.gebruiksvoorschriften.map((voorschrift, index) => (
                            <GebruiksvoorschriftCard key={index} voorschrift={voorschrift} />
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Etikettering */}
            {middel.etikettering && (
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-white flex items-center gap-2 text-lg">
                            <TriangleAlert className="h-5 w-5 text-amber-400" />
                            Etikettering & Veiligheid
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* GHS Symbolen */}
                        {middel.etikettering.ghsSymbolen && middel.etikettering.ghsSymbolen.length > 0 && (
                            <div>
                                <p className="text-white/40 text-xs font-bold uppercase mb-3">GHS Symbolen</p>
                                <div className="flex flex-wrap gap-2">
                                    {middel.etikettering.ghsSymbolen.map((symbool, i) => (
                                        <Badge key={i} variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 font-mono">
                                            {symbool}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Signaalwoord */}
                        {middel.etikettering.signaalwoord && (
                            <div>
                                <p className="text-white/40 text-xs font-bold uppercase mb-2">Signaalwoord</p>
                                <Badge
                                    className={cn(
                                        "font-bold text-sm",
                                        middel.etikettering.signaalwoord === 'Gevaar'
                                            ? "bg-red-500 text-white"
                                            : "bg-amber-500 text-black"
                                    )}
                                >
                                    {middel.etikettering.signaalwoord}
                                </Badge>
                            </div>
                        )}

                        {/* H-zinnen */}
                        {middel.etikettering.hZinnen && middel.etikettering.hZinnen.length > 0 && (
                            <div>
                                <p className="text-white/40 text-xs font-bold uppercase mb-3">Gevarenaanduidingen (H-zinnen)</p>
                                <div className="space-y-2">
                                    {middel.etikettering.hZinnen.map((h, i) => (
                                        <div key={i} className="flex items-start gap-3 bg-red-500/5 rounded-lg p-3 border border-red-500/10">
                                            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 font-mono shrink-0">
                                                {h.code}
                                            </Badge>
                                            <p className="text-white/70 text-sm">{h.tekst}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* P-zinnen */}
                        {middel.etikettering.pZinnen && middel.etikettering.pZinnen.length > 0 && (
                            <div>
                                <p className="text-white/40 text-xs font-bold uppercase mb-3">Voorzorgsmaatregelen (P-zinnen)</p>
                                <div className="space-y-2">
                                    {middel.etikettering.pZinnen.map((p, i) => (
                                        <div key={i} className="flex items-start gap-3 bg-blue-500/5 rounded-lg p-3 border border-blue-500/10">
                                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono shrink-0">
                                                {p.code}
                                            </Badge>
                                            <p className="text-white/70 text-sm">{p.tekst}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function GebruiksvoorschriftCard({ voorschrift, highlight = false }: { voorschrift: CtgbGebruiksvoorschrift; highlight?: boolean }) {
    return (
        <div className={cn(
            "rounded-xl p-4 border",
            highlight
                ? "bg-emerald-500/5 border-emerald-500/10"
                : "bg-white/[0.02] border-white/5"
        )}>
            {/* Header: Gewas & Doelorganisme */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "p-2 rounded-lg",
                        highlight ? "bg-emerald-500/10" : "bg-white/5"
                    )}>
                        <Sprout className={cn(
                            "h-5 w-5",
                            highlight ? "text-emerald-400" : "text-white/40"
                        )} />
                    </div>
                    <div>
                        <p className="font-bold text-white">{voorschrift.gewas || 'Alle gewassen'}</p>
                        {voorschrift.doelorganisme && (
                            <p className="text-sm text-white/50 flex items-center gap-1.5 mt-0.5">
                                <Target className="h-3 w-3" />
                                {voorschrift.doelorganisme}
                            </p>
                        )}
                    </div>
                </div>
                {voorschrift.dosering && (
                    <Badge className="bg-primary/20 text-primary border-0 font-bold text-sm px-3 py-1">
                        {voorschrift.dosering}
                    </Badge>
                )}
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {voorschrift.maxToepassingen && (
                    <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase mb-1">
                            <RefreshCw className="h-3 w-3" />
                            Max. toepassingen
                        </div>
                        <p className="font-bold text-white">{voorschrift.maxToepassingen}x per jaar</p>
                    </div>
                )}

                {voorschrift.interval && (
                    <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase mb-1">
                            <Clock className="h-3 w-3" />
                            Interval
                        </div>
                        <p className="font-bold text-white">{voorschrift.interval}</p>
                    </div>
                )}

                {voorschrift.veiligheidstermijn && (
                    <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/10">
                        <div className="flex items-center gap-1.5 text-amber-400/60 text-[10px] font-bold uppercase mb-1">
                            <Shield className="h-3 w-3" />
                            Veiligheidstermijn
                        </div>
                        <p className="font-bold text-amber-400">{voorschrift.veiligheidstermijn}</p>
                    </div>
                )}

                {voorschrift.locatie && (
                    <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase mb-1">
                            <MapPin className="h-3 w-3" />
                            Locatie
                        </div>
                        <p className="font-bold text-white">{voorschrift.locatie}</p>
                    </div>
                )}
            </div>

            {/* W-codes */}
            {voorschrift.wCodes && voorschrift.wCodes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Droplets className="h-3.5 w-3.5 text-blue-400" />
                        {voorschrift.wCodes.map((code, i) => (
                            <Badge key={i} variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">
                                {code}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* Opmerkingen */}
            {voorschrift.opmerkingen && voorschrift.opmerkingen.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-start gap-2">
                        <Info className="h-3.5 w-3.5 text-white/30 mt-0.5 shrink-0" />
                        <div className="text-sm text-white/50 space-y-1">
                            {voorschrift.opmerkingen.map((opmerking, i) => (
                                <p key={i}>{typeof opmerking === "string" ? opmerking : JSON.stringify(opmerking)}</p>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

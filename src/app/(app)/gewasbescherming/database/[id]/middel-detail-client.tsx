'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    ChevronLeft,
    Sprout,
    Factory,
    Calendar,
    Clock,
    Droplets,
    Shield,
    Leaf,
    Target,
    MapPin,
    RefreshCw,
    FileText,
    Beaker,
    TriangleAlert,
    Info,
    ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CtgbCategoryBadge } from '@/components/ctgb-category-badge';
import type { CtgbProduct, CtgbGebruiksvoorschrift } from '@/lib/types';
import { SpotlightCard, GlowOrb, type PaletteColor } from '@/components/ui/premium';
import { AnimatePresence, motion } from 'framer-motion';

function getProductPalette(productTypes?: string[]): PaletteColor {
    if (!productTypes || productTypes.length === 0) return 'emerald';
    const types = productTypes.map(t => t.toLowerCase());
    if (types.some(t => t.includes('fungicide'))) return 'purple';
    if (types.some(t => t.includes('insecticide'))) return 'orange';
    if (types.some(t => t.includes('herbicide'))) return 'amber';
    if (types.some(t => t.includes('groeiregulator'))) return 'blue';
    return 'emerald';
}

// GHS symbol → Dutch text explanation (for senior-friendly clarity)
const GHS_EXPLANATIONS: Record<string, string> = {
    GHS01: 'Ontplofbaar',
    GHS02: 'Ontvlambaar',
    GHS03: 'Oxiderend',
    GHS04: 'Gas onder druk',
    GHS05: 'Bijtend / corrosief',
    GHS06: 'Acuut giftig',
    GHS07: 'Schadelijk / irriterend',
    GHS08: 'Gezondheidsgevaarlijk bij langdurige blootstelling',
    GHS09: 'Milieugevaarlijk',
};

function explainGHS(symbol: string): string {
    // Symbol might be "GHS07" or "GHS07 - Schadelijk" etc.
    const match = symbol.match(/GHS0?\d/i);
    if (match) {
        const key = match[0].toUpperCase().replace('GHS0', 'GHS0');
        // Normaliseer naar GHS0X met 2-cijferige suffix
        const normalized = key.length === 4 ? key : `GHS0${key.slice(3)}`;
        return GHS_EXPLANATIONS[normalized] || symbol;
    }
    return symbol;
}

export function MiddelDetailClient({ middel }: { middel: CtgbProduct }) {
    const router = useRouter();

    const isValid = middel.status === 'Valid';
    const palette = getProductPalette(middel.productTypes);

    // Group voorschriften by gewas
    const voorschriftenByGewas = React.useMemo(() => {
        const map = new Map<string, CtgbGebruiksvoorschrift[]>();
        for (const v of middel.gebruiksvoorschriften) {
            const key = v.gewas || 'Overig';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(v);
        }
        // Sort: hardfruit first, then alphabet
        return Array.from(map.entries()).sort(([a], [b]) => {
            const hardfruitPriority = (gewas: string) => {
                const lower = gewas.toLowerCase();
                if (lower.includes('appel') || lower.includes('peer') || lower.includes('pitvruchten')) return 0;
                return 1;
            };
            const pa = hardfruitPriority(a);
            const pb = hardfruitPriority(b);
            if (pa !== pb) return pa - pb;
            return a.localeCompare(b);
        });
    }, [middel.gebruiksvoorschriften]);

    return (
        <div className="relative">
            <GlowOrb color={palette} position="top-right" size="w-[500px] h-[320px]" blur="blur-[140px]" opacity={0.08} />
            <GlowOrb color={isValid ? 'emerald' : 'purple'} position="top-left" size="w-[360px] h-[240px]" blur="blur-[140px]" opacity={0.05} />

            <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
                {/* Back Button — chunky */}
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="h-11 text-base text-slate-300 hover:text-white -ml-3"
                >
                    <ChevronLeft className="mr-1 h-5 w-5" />
                    Terug naar overzicht
                </Button>

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">{middel.naam}</h1>
                            <Badge
                                variant="outline"
                                className={cn(
                                    'font-bold text-sm h-8 px-3',
                                    isValid
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-red-500/10 text-red-400 border-red-500/20',
                                )}
                            >
                                {isValid ? 'Toegelaten' : 'Verlopen'}
                            </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-base text-slate-400">
                            <span className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                {middel.toelatingsnummer}
                            </span>
                            {middel.toelatingshouder && (
                                <span className="flex items-center gap-2">
                                    <Factory className="h-4 w-4" />
                                    {middel.toelatingshouder}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <CtgbCategoryBadge productTypes={middel.productTypes} />
                    </div>
                </div>

                {/* Quick Stats — stack on mobile, grid on tablet+ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <SpotlightCard color={palette} padding="p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">
                            <Beaker className="h-4 w-4" />
                            Werkzame stoffen
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {middel.werkzameStoffen.slice(0, 3).map(stof => (
                                <Badge key={stof} variant="secondary" className="bg-white/10 text-white/90 text-sm px-2.5 py-0.5">
                                    {stof}
                                </Badge>
                            ))}
                            {middel.werkzameStoffen.length > 3 && (
                                <Badge variant="secondary" className="bg-white/5 text-white/50 text-sm px-2.5 py-0.5">
                                    +{middel.werkzameStoffen.length - 3}
                                </Badge>
                            )}
                        </div>
                    </SpotlightCard>

                    <SpotlightCard color={palette} padding="p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">
                            <Calendar className="h-4 w-4" />
                            Vervaldatum
                        </div>
                        <p className={cn('font-bold text-lg', isValid ? 'text-white' : 'text-red-400')}>
                            {middel.vervaldatum
                                ? new Date(middel.vervaldatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
                                : '—'}
                        </p>
                    </SpotlightCard>

                    <SpotlightCard color={palette} padding="p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">
                            <Sprout className="h-4 w-4" />
                            Hardfruit
                        </div>
                        <p className="font-bold text-lg text-white">
                            {(() => {
                                const hf = middel.gebruiksvoorschriften.filter(g =>
                                    g.gewas?.toLowerCase().match(/appel|peer|pitvruchten|vruchtbomen/),
                                ).length;
                                return hf > 0 ? `${hf} voorschriften` : 'Niet toegelaten';
                            })()}
                        </p>
                    </SpotlightCard>

                    <SpotlightCard color={palette} padding="p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">
                            <FileText className="h-4 w-4" />
                            Totaal
                        </div>
                        <p className="font-bold text-lg text-white">
                            {middel.gebruiksvoorschriften.length} voorschriften
                        </p>
                    </SpotlightCard>
                </div>

                {/* Samenstelling */}
                {middel.samenstelling && (
                    <SpotlightCard color={palette}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Beaker className="h-5 w-5 text-primary" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Samenstelling</h2>
                        </div>
                        <div className="space-y-3">
                            {middel.samenstelling.formuleringstype && (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-sm px-3 py-1">
                                    {middel.samenstelling.formuleringstype}
                                </Badge>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {middel.samenstelling.stoffen.map((stof, i) => (
                                    <div key={i} className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.06]">
                                        <p className="font-bold text-base text-white">{stof.naam}</p>
                                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mt-1.5">
                                            {stof.concentratie && <span className="font-medium">{stof.concentratie}</span>}
                                            {stof.casNummer && <span className="text-xs">CAS: {stof.casNummer}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </SpotlightCard>
                )}

                {/* Gebruiksvoorschriften per gewas — accordion */}
                <SpotlightCard color={palette}>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <Leaf className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Gebruiksvoorschriften</h2>
                            <p className="text-sm text-slate-400">Gegroepeerd per gewas — klik om details te zien</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {voorschriftenByGewas.map(([gewas, items]) => (
                            <GewasAccordion key={gewas} gewas={gewas} items={items} />
                        ))}
                    </div>
                </SpotlightCard>

                {/* Etikettering & veiligheid — GHS WITH TEXT */}
                {middel.etikettering && (
                    <SpotlightCard color="amber">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <TriangleAlert className="h-5 w-5 text-amber-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Etikettering &amp; veiligheid</h2>
                        </div>
                        <div className="space-y-6">
                            {/* GHS Symbolen met tekst */}
                            {middel.etikettering.ghsSymbolen && middel.etikettering.ghsSymbolen.length > 0 && (
                                <div>
                                    <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">GHS Gevarensymbolen</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {middel.etikettering.ghsSymbolen.map((symbool, i) => (
                                            <div key={i} className="flex items-center gap-3 bg-red-500/5 rounded-xl p-3 border border-red-500/15">
                                                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 font-mono text-sm shrink-0 h-8 px-3">
                                                    {symbool}
                                                </Badge>
                                                <span className="text-base text-white font-medium">{explainGHS(symbool)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Signaalwoord */}
                            {middel.etikettering.signaalwoord && (
                                <div>
                                    <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">Signaalwoord</p>
                                    <Badge
                                        className={cn(
                                            'font-bold text-base h-9 px-4',
                                            middel.etikettering.signaalwoord === 'Gevaar'
                                                ? 'bg-red-500 text-white'
                                                : 'bg-amber-500 text-black',
                                        )}
                                    >
                                        {middel.etikettering.signaalwoord}
                                    </Badge>
                                </div>
                            )}

                            {/* H-zinnen */}
                            {middel.etikettering.hZinnen && middel.etikettering.hZinnen.length > 0 && (
                                <div>
                                    <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">Gevarenaanduidingen (H-zinnen)</p>
                                    <div className="space-y-2">
                                        {middel.etikettering.hZinnen.map((h, i) => (
                                            <div key={i} className="flex items-start gap-3 bg-red-500/5 rounded-xl p-4 border border-red-500/10">
                                                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 font-mono shrink-0 h-7 px-2.5 text-sm">
                                                    {h.code}
                                                </Badge>
                                                <p className="text-base text-slate-200 leading-relaxed">{h.tekst}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* P-zinnen */}
                            {middel.etikettering.pZinnen && middel.etikettering.pZinnen.length > 0 && (
                                <div>
                                    <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">Voorzorgsmaatregelen (P-zinnen)</p>
                                    <div className="space-y-2">
                                        {middel.etikettering.pZinnen.map((p, i) => (
                                            <div key={i} className="flex items-start gap-3 bg-blue-500/5 rounded-xl p-4 border border-blue-500/10">
                                                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono shrink-0 h-7 px-2.5 text-sm">
                                                    {p.code}
                                                </Badge>
                                                <p className="text-base text-slate-200 leading-relaxed">{p.tekst}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </SpotlightCard>
                )}
            </div>
        </div>
    );
}

// ============================================
// Per-gewas Accordion
// ============================================

function GewasAccordion({ gewas, items }: { gewas: string; items: CtgbGebruiksvoorschrift[] }) {
    const isHardfruit = gewas.toLowerCase().match(/appel|peer|pitvruchten|vruchtbomen/);
    const [open, setOpen] = React.useState(!!isHardfruit);

    const dosageList = items
        .map(v => v.dosering)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');

    return (
        <div className={cn(
            'rounded-2xl border overflow-hidden transition-colors',
            isHardfruit ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-white/[0.02] border-white/[0.08]',
        )}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02]"
            >
                <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    isHardfruit ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5 border border-white/10',
                )}>
                    <Sprout className={cn('h-5 w-5', isHardfruit ? 'text-emerald-400' : 'text-slate-400')} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-lg text-white">{gewas}</p>
                    {dosageList && (
                        <p className="text-sm text-slate-400 truncate">
                            {items.length} {items.length === 1 ? 'voorschrift' : 'voorschriften'} · {dosageList}
                        </p>
                    )}
                </div>
                <ChevronDown className={cn('h-5 w-5 text-slate-400 transition-transform duration-300 shrink-0', open && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06]">
                            {items.map((voorschrift, idx) => (
                                <VoorschriftBlock key={idx} voorschrift={voorschrift} highlight={!!isHardfruit} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function VoorschriftBlock({ voorschrift, highlight }: { voorschrift: CtgbGebruiksvoorschrift; highlight: boolean }) {
    return (
        <div className={cn(
            'rounded-xl p-4 border mt-3',
            highlight ? 'bg-emerald-500/[0.04] border-emerald-500/10' : 'bg-white/[0.02] border-white/[0.06]',
        )}>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                    {voorschrift.doelorganisme && (
                        <p className="text-base text-slate-200 flex items-center gap-2">
                            <Target className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="font-medium">{voorschrift.doelorganisme}</span>
                        </p>
                    )}
                </div>
                {voorschrift.dosering && (
                    <Badge className="bg-primary/20 text-primary border-0 font-bold text-base px-3 py-1 h-8 tabular-nums">
                        {voorschrift.dosering}
                    </Badge>
                )}
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {voorschrift.maxToepassingen && (
                    <div className="bg-white/[0.03] rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-wide mb-1.5">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Max. toepassingen
                        </div>
                        <p className="font-bold text-base text-white">{voorschrift.maxToepassingen}× per jaar</p>
                    </div>
                )}

                {voorschrift.interval && (
                    <div className="bg-white/[0.03] rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-wide mb-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            Interval
                        </div>
                        <p className="font-bold text-base text-white">{voorschrift.interval}</p>
                    </div>
                )}

                {voorschrift.veiligheidstermijn && (
                    <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/15">
                        <div className="flex items-center gap-1.5 text-amber-400/80 text-xs font-bold uppercase tracking-wide mb-1.5">
                            <Shield className="h-3.5 w-3.5" />
                            Veiligheidstermijn
                        </div>
                        <p className="font-bold text-base text-amber-400">{voorschrift.veiligheidstermijn}</p>
                    </div>
                )}

                {voorschrift.locatie && (
                    <div className="bg-white/[0.03] rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-wide mb-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            Locatie
                        </div>
                        <p className="font-bold text-base text-white">{voorschrift.locatie}</p>
                    </div>
                )}
            </div>

            {/* W-codes */}
            {voorschrift.wCodes && voorschrift.wCodes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Droplets className="h-4 w-4 text-blue-400" />
                        {voorschrift.wCodes.map((code, i) => (
                            <Badge key={i} variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-sm">
                                {code}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* Opmerkingen */}
            {voorschrift.opmerkingen && voorschrift.opmerkingen.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                        <div className="text-sm text-slate-300 space-y-1">
                            {voorschrift.opmerkingen.map((opmerking, i) => (
                                <p key={i}>
                                    {typeof opmerking === 'string'
                                        ? opmerking
                                        : (opmerking as { sentenceNL?: string; orgSentenceNL?: string })?.sentenceNL ||
                                          (opmerking as { sentenceNL?: string; orgSentenceNL?: string })?.orgSentenceNL ||
                                          JSON.stringify(opmerking)}
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

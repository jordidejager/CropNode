'use client';

import * as React from 'react';
import { useState } from 'react';
import {
    FlaskConical,
    Shield,
    Clock,
    Droplets,
    Target,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Leaf,
    Calendar,
    Hash,
    Building2,
    CheckCircle2,
    XCircle,
    Info
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CtgbProduct, CtgbGebruiksvoorschrift } from '@/lib/types';

interface ProductInfoCardProps {
    product: CtgbProduct;
    className?: string;
}

// Status badge styling
function getStatusStyle(status: string) {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('toegelaten') || statusLower.includes('actief')) {
        return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: CheckCircle2 };
    }
    if (statusLower.includes('vervallen') || statusLower.includes('ingetrokken')) {
        return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle };
    }
    return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', icon: Info };
}

// Product type badge styling
function getProductTypeStyle(type: string) {
    switch (type) {
        case 'Fungicide': return { bg: 'bg-purple-500/20', text: 'text-purple-400' };
        case 'Insecticide': return { bg: 'bg-red-500/20', text: 'text-red-400' };
        case 'Herbicide': return { bg: 'bg-orange-500/20', text: 'text-orange-400' };
        case 'Acaricide': return { bg: 'bg-pink-500/20', text: 'text-pink-400' };
        default: return { bg: 'bg-slate-500/20', text: 'text-slate-400' };
    }
}

// Single usage prescription card
function UsageCard({ usage, index }: { usage: CtgbGebruiksvoorschrift; index: number }) {
    const [expanded, setExpanded] = useState(index === 0);

    return (
        <div className="border border-white/[0.08] rounded-lg overflow-hidden bg-white/[0.02]">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/[0.03] transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Leaf className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-medium text-white">{usage.gewas}</p>
                        {usage.doelorganisme && (
                            <p className="text-xs text-white/50">{usage.doelorganisme}</p>
                        )}
                    </div>
                </div>
                {expanded ? (
                    <ChevronUp className="h-4 w-4 text-white/40" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-white/40" />
                )}
            </button>

            {expanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-white/[0.06] pt-3">
                    {/* Dosage */}
                    {usage.dosering && (
                        <div className="flex items-start gap-2">
                            <Droplets className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-white/50 uppercase tracking-wide">Dosering</p>
                                <p className="text-sm text-white font-medium">{usage.dosering}</p>
                            </div>
                        </div>
                    )}

                    {/* Target organism */}
                    {usage.doelorganisme && (
                        <div className="flex items-start gap-2">
                            <Target className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-white/50 uppercase tracking-wide">Doelorganisme</p>
                                <p className="text-sm text-white">{usage.doelorganisme}</p>
                            </div>
                        </div>
                    )}

                    {/* Application method */}
                    {usage.toepassingsmethode && (
                        <div className="flex items-start gap-2">
                            <FlaskConical className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-white/50 uppercase tracking-wide">Toepassingsmethode</p>
                                <p className="text-sm text-white">{usage.toepassingsmethode}</p>
                            </div>
                        </div>
                    )}

                    {/* Max applications */}
                    {(usage.maxToepassingen || usage.maxToepassingenPerTeeltcyclus) && (
                        <div className="flex items-start gap-2">
                            <Hash className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-white/50 uppercase tracking-wide">Max. toepassingen</p>
                                <p className="text-sm text-white">
                                    {usage.maxToepassingen || usage.maxToepassingenPerTeeltcyclus}x per teeltcyclus
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Safety period */}
                    {usage.veiligheidstermijn && (
                        <div className="flex items-start gap-2">
                            <Shield className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-white/50 uppercase tracking-wide">Veiligheidstermijn</p>
                                <p className="text-sm text-white font-medium">{usage.veiligheidstermijn}</p>
                            </div>
                        </div>
                    )}

                    {/* Interval */}
                    {usage.interval && (
                        <div className="flex items-start gap-2">
                            <Clock className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-white/50 uppercase tracking-wide">Interval</p>
                                <p className="text-sm text-white">{usage.interval}</p>
                            </div>
                        </div>
                    )}

                    {/* W-codes (restrictions) */}
                    {usage.wCodes && usage.wCodes.length > 0 && (
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-white/50 uppercase tracking-wide">Restricties</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {usage.wCodes.map((code, i) => (
                                        <Badge
                                            key={i}
                                            variant="outline"
                                            className="text-[10px] bg-orange-500/10 border-orange-500/30 text-orange-400"
                                        >
                                            {code}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {usage.opmerkingen && usage.opmerkingen.length > 0 && (
                        <div className="p-2 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                            <p className="text-xs text-white/50 mb-1">Opmerkingen:</p>
                            <ul className="space-y-1">
                                {usage.opmerkingen.map((note, i) => (
                                    <li key={i} className="text-xs text-white/70">• {note}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function ProductInfoCard({ product, className }: ProductInfoCardProps) {
    const [showAllUsages, setShowAllUsages] = useState(false);
    const statusStyle = getStatusStyle(product.status);
    const StatusIcon = statusStyle.icon;

    const displayedUsages = showAllUsages
        ? product.gebruiksvoorschriften
        : product.gebruiksvoorschriften.slice(0, 3);

    return (
        <div className={cn(
            "rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden",
            className
        )}>
            {/* Header */}
            <div className="p-4 border-b border-white/[0.06] bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                            <FlaskConical className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">{product.naam}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-white/50">#{product.toelatingsnummer}</span>
                                <Badge className={cn("text-[10px]", statusStyle.bg, statusStyle.text, statusStyle.border)}>
                                    <StatusIcon className="h-3 w-3 mr-1" />
                                    {product.status}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Product types */}
                {product.productTypes && product.productTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {product.productTypes.map((type, i) => {
                            const style = getProductTypeStyle(type);
                            return (
                                <Badge key={i} variant="outline" className={cn("text-xs", style.bg, style.text)}>
                                    {type}
                                </Badge>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Quick Info */}
            <div className="p-4 border-b border-white/[0.06] grid grid-cols-2 gap-3">
                {/* Active substances */}
                <div className="flex items-start gap-2">
                    <FlaskConical className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-xs text-white/50 uppercase tracking-wide">Werkzame stoffen</p>
                        <p className="text-sm text-white">{product.werkzameStoffen?.join(', ') || 'Onbekend'}</p>
                    </div>
                </div>

                {/* Expiry date */}
                {product.vervaldatum && (
                    <div className="flex items-start gap-2">
                        <Calendar className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-white/50 uppercase tracking-wide">Geldig tot</p>
                            <p className="text-sm text-white">{product.vervaldatum}</p>
                        </div>
                    </div>
                )}

                {/* Authorization holder */}
                {product.toelatingshouder && (
                    <div className="flex items-start gap-2 col-span-2">
                        <Building2 className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-white/50 uppercase tracking-wide">Toelatingshouder</p>
                            <p className="text-sm text-white">{product.toelatingshouder}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Usage Prescriptions */}
            {product.gebruiksvoorschriften && product.gebruiksvoorschriften.length > 0 && (
                <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-white flex items-center gap-2">
                            <Leaf className="h-4 w-4 text-emerald-400" />
                            Gebruiksvoorschriften
                        </h4>
                        <Badge variant="outline" className="text-xs bg-white/5 border-white/10">
                            {product.gebruiksvoorschriften.length} gewassen
                        </Badge>
                    </div>

                    <div className="space-y-2">
                        {displayedUsages.map((usage, i) => (
                            <UsageCard key={i} usage={usage} index={i} />
                        ))}
                    </div>

                    {product.gebruiksvoorschriften.length > 3 && (
                        <button
                            onClick={() => setShowAllUsages(!showAllUsages)}
                            className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            {showAllUsages ? (
                                <>
                                    <ChevronUp className="h-4 w-4" />
                                    Toon minder
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="h-4 w-4" />
                                    Toon alle {product.gebruiksvoorschriften.length} gewassen
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* Warnings (Etikettering) */}
            {product.etikettering && (product.etikettering.ghsSymbolen?.length || product.etikettering.hZinnen?.length) && (
                <div className="p-4 border-t border-white/[0.06] bg-red-500/5">
                    <h4 className="text-sm font-medium text-red-400 flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-4 w-4" />
                        Veiligheid & Etikettering
                    </h4>

                    {product.etikettering.signaalwoord && (
                        <Badge className="mb-2 bg-red-500/20 text-red-400 border-red-500/30">
                            {product.etikettering.signaalwoord}
                        </Badge>
                    )}

                    {product.etikettering.ghsSymbolen && product.etikettering.ghsSymbolen.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                            {product.etikettering.ghsSymbolen.map((symbol, i) => (
                                <Badge key={i} variant="outline" className="text-xs bg-white/5 border-white/10 text-white/70">
                                    {symbol}
                                </Badge>
                            ))}
                        </div>
                    )}

                    {product.etikettering.hZinnen && product.etikettering.hZinnen.length > 0 && (
                        <div className="space-y-1 text-xs text-white/60">
                            {product.etikettering.hZinnen.slice(0, 3).map((h, i) => (
                                <p key={i}>
                                    <span className="text-red-400 font-mono">{h.code}</span>: {h.tekst}
                                </p>
                            ))}
                            {product.etikettering.hZinnen.length > 3 && (
                                <p className="text-white/40">+{product.etikettering.hZinnen.length - 3} meer...</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Compact version for search results list
export function ProductInfoCompact({ product, onClick }: { product: CtgbProduct; onClick?: () => void }) {
    const statusStyle = getStatusStyle(product.status);

    return (
        <button
            onClick={onClick}
            className="w-full text-left p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-blue-500/30 transition-all"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <FlaskConical className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-white">{product.naam}</p>
                        <p className="text-xs text-white/50">
                            #{product.toelatingsnummer} • {product.werkzameStoffen?.join(', ')}
                        </p>
                    </div>
                </div>
                <Badge className={cn("text-[10px]", statusStyle.bg, statusStyle.text, statusStyle.border)}>
                    {product.status}
                </Badge>
            </div>
        </button>
    );
}

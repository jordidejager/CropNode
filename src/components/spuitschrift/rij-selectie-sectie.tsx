'use client';

/**
 * Rijenkaart (beta) — "Alleen bepaalde rijen?" in de stap Percelen van NewSprayDialog.
 *
 * Per geselecteerd hoofdperceel met rijen een invoerveld ("1-20, 24", "blok A", …).
 * De tekst wordt geparsed op de rijen van dat perceel en via rijSelectieOppervlakAction
 * omgerekend naar subpercelen + behandeld oppervlak. Het resultaat gaat via onResultaat
 * naar de dialoog, die met vatRijSelectieSamen de plots en het totale oppervlak bepaalt.
 *
 * Zonder rijen (of met lege velden) verandert er niets aan de bespuiting.
 */

import * as React from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2, Rows3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { rijSelectieOppervlakAction } from '@/app/rijen-actions';
import { rijenFoutmelding, useRijenkaart, useRijenOverzicht } from '@/hooks/use-rijen';
import { formatteerBereiken, parseRijSelectie } from '@/lib/rijen/selectie';
import type { RijenSamenvatting } from '@/lib/rijen/types';
import type { RijSelectieOppervlakPerceel } from '@/lib/rijen/koppelingen';
import type { SprayableParcel } from '@/lib/supabase-store';

// ============================================
// Types + pure helpers
// ============================================

/** Stand van de rij-invoer van één hoofdperceel. */
export interface RijPerceelResultaat {
    perceelId: string;
    /** De tekst waarvoor dit resultaat geldt */
    tekst: string;
    /** leeg = hele perceel; bezig = laden/rekenen; fout = invoer niet bruikbaar; ok = geldige rijselectie */
    status: 'leeg' | 'bezig' | 'fout' | 'ok';
    fouten: string[];
    oppervlak: RijSelectieOppervlakPerceel | null;
    /** Bij 'ok': de geparste rij-id's (komma-gescheiden) waarvoor `oppervlak` is berekend */
    sleutel?: string;
}

export interface RijSelectieSamenvatting {
    /** Geldige rijselecties van geselecteerde hoofdpercelen */
    actief: RijSelectieOppervlakPerceel[];
    /** Alle rij-id's samen (leeg = geen rijselectie) */
    rijIds: string[];
    /** Subpercelen voor de bespuiting: bij rij-percelen alleen de subpercelen van de rijen */
    plots: string[];
    /** Totaal oppervlak (ha); rij-percelen tellen met hun behandelde rij-oppervlak */
    totaalHa: number;
    /** Een rijveld is nog niet klaar of ongeldig → niet verder */
    blokkeert: boolean;
}

/** Hoofdpercelen (parcelId) van de geselecteerde subpercelen, in volgorde van selectie. */
export function hoofdpercelenVan(parcels: SprayableParcel[], selectedIds: string[]): { id: string; naam: string }[] {
    const perId = new Map(parcels.map(p => [p.id, p]));
    const uit = new Map<string, string>();
    for (const id of selectedIds) {
        const p = perId.get(id);
        if (p && p.parcelId && !uit.has(p.parcelId)) uit.set(p.parcelId, p.parcelName || p.name);
    }
    return Array.from(uit, ([id, naam]) => ({ id, naam }));
}

/**
 * Combineert de selectie uit de multiselect met de rijselecties. Zonder (geldige) rijselectie
 * zijn plots en totaal precies zoals voorheen: de geselecteerde subpercelen met hun volle oppervlak.
 */
export function vatRijSelectieSamen(
    parcels: SprayableParcel[],
    selectedIds: string[],
    teksten: Record<string, string>,
    resultaten: Record<string, RijPerceelResultaat>,
): RijSelectieSamenvatting {
    const perId = new Map(parcels.map(p => [p.id, p]));
    const oppervlakVan = (ids: string[]) =>
        parcels.filter(p => ids.includes(p.id)).reduce((s, p) => s + (p.area || 0), 0);

    const actief: RijSelectieOppervlakPerceel[] = [];
    let blokkeert = false;
    for (const h of hoofdpercelenVan(parcels, selectedIds)) {
        const tekst = (teksten[h.id] ?? '').trim();
        if (!tekst) continue;
        const r = resultaten[h.id];
        if (!r || r.tekst.trim() !== tekst || r.status === 'bezig' || r.status === 'fout') {
            blokkeert = true;
            continue;
        }
        if (r.status === 'ok' && r.oppervlak) actief.push(r.oppervlak);
    }

    if (actief.length === 0) {
        return {
            actief,
            rijIds: [],
            plots: selectedIds,
            totaalHa: oppervlakVan(selectedIds),
            blokkeert,
        };
    }

    const rijPercelen = new Set(actief.map(a => a.perceelId));
    const rijPlots = new Set(actief.flatMap(a => a.plots));
    const plots = Array.from(new Set([
        ...selectedIds.filter(id => {
            const perceelId = perId.get(id)?.parcelId;
            return !(perceelId && rijPercelen.has(perceelId) && !rijPlots.has(id));
        }),
        ...rijPlots,
    ]));
    const overigHa = oppervlakVan(plots.filter(id => !rijPlots.has(id)));
    const rijHa = actief.reduce((s, a) => s + a.oppervlakHa, 0);

    return {
        actief,
        rijIds: Array.from(new Set(actief.flatMap(a => a.rijIds))),
        plots,
        totaalHa: overigHa + rijHa,
        blokkeert,
    };
}

/** "1,82" */
export function formatHa(ha: number): string {
    return ha.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Rijen 1–20 (Steketee) · 0,61 ha" */
export function rijSelectieRegel(a: RijSelectieOppervlakPerceel): string {
    const woord = a.nummers.length === 1 ? 'Rij' : 'Rijen';
    const naam = a.perceelNaam ? ` (${a.perceelNaam})` : '';
    return `${woord} ${formatteerBereiken(a.nummers)}${naam} · ${formatHa(a.oppervlakHa)} ha`;
}

/**
 * De app draait met `refetchOnMount: false` (query-provider). Een rijen-query die intussen
 * verouderd of ongeldig is gemaakt (bv. na rijen genereren op de rijenkaart) zou dan bij het
 * openen van deze stap oude data tonen. Daarom: één keer verversen zodra er data is én die
 * verouderd is. Zonder cache haalt de query zelf al op.
 */
function useVersBijTonen(
    query: { data: unknown; isStale: boolean; isFetching: boolean; refetch: () => Promise<unknown> },
    actief: boolean,
) {
    const gedaan = React.useRef(false);
    const { data, isStale, isFetching, refetch } = query;
    React.useEffect(() => {
        if (!actief || gedaan.current || data === undefined) return;
        gedaan.current = true;
        if (isStale && !isFetching) void refetch();
    }, [actief, data, isStale, isFetching, refetch]);
}

// ============================================
// Sectie
// ============================================

interface RijSelectieSectieProps {
    parcels: SprayableParcel[];
    selectedIds: string[];
    teksten: Record<string, string>;
    resultaten: Record<string, RijPerceelResultaat>;
    onTekstChange: (perceelId: string, tekst: string) => void;
    onResultaat: (resultaat: RijPerceelResultaat) => void;
    standaardOpen?: boolean;
}

export function RijSelectieSectie({
    parcels,
    selectedIds,
    teksten,
    resultaten,
    onTekstChange,
    onResultaat,
    standaardOpen = false,
}: RijSelectieSectieProps) {
    const overzichtQuery = useRijenOverzicht();
    useVersBijTonen(overzichtQuery, true);
    const overzicht = overzichtQuery.data;

    const hoofdpercelen = React.useMemo(() => hoofdpercelenVan(parcels, selectedIds), [parcels, selectedIds]);
    const samenvattingPerPerceel = React.useMemo(
        () => new Map((overzicht ?? []).map(s => [s.perceelId, s])),
        [overzicht],
    );

    // Percelen met actieve rijen; een perceel met ingevulde tekst blijft zichtbaar (ook als het
    // overzicht niet laadt), zodat een selectie altijd te zien en te wissen is.
    const metRijen = hoofdpercelen.filter(h =>
        (samenvattingPerPerceel.get(h.id)?.aantalActief ?? 0) > 0 || !!(teksten[h.id] ?? '').trim(),
    );

    const [open, setOpen] = React.useState(
        () => standaardOpen || metRijen.some(h => !!(teksten[h.id] ?? '').trim()),
    );

    if (metRijen.length === 0) return null;

    const geldig = metRijen
        .map(h => resultaten[h.id])
        .filter((r): r is RijPerceelResultaat =>
            !!r && r.status === 'ok' && !!r.oppervlak && r.tekst.trim() === (teksten[r.perceelId] ?? '').trim() && !!r.tekst.trim());
    const standVan = (perceelId: string): 'leeg' | 'bezig' | 'fout' | 'ok' => {
        const tekst = (teksten[perceelId] ?? '').trim();
        if (!tekst) return 'leeg';
        const r = resultaten[perceelId];
        if (!r || r.tekst.trim() !== tekst) return 'bezig';
        return r.status;
    };
    const heeftFout = metRijen.some(h => standVan(h.id) === 'fout');
    const isBezig = metRijen.some(h => standVan(h.id) === 'bezig');

    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="w-full min-h-[56px] flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
            >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Rows3 className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-slate-200">
                        Alleen bepaalde rijen? <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400/80 ml-1">beta</span>
                    </p>
                    {!open && geldig.length > 0 && (
                        <p className="text-sm text-emerald-400 truncate">
                            {geldig.map(r => rijSelectieRegel(r.oppervlak as RijSelectieOppervlakPerceel)).join(' · ')}
                        </p>
                    )}
                    {!open && heeftFout && (
                        <p className="text-sm text-amber-400">Rijselectie klopt nog niet — tik om te bekijken</p>
                    )}
                    {!open && !heeftFout && isBezig && (
                        <p className="text-sm text-slate-400">Rijselectie wordt berekend…</p>
                    )}
                </div>
                <ChevronDown className={cn('h-5 w-5 text-slate-400 shrink-0 transition-transform', open && 'rotate-180')} />
            </button>

            {/* Altijd gemount (ook ingeklapt), zodat lopende berekeningen hun resultaat afmaken */}
            <div className={cn('border-t border-white/[0.06] p-4 space-y-3', !open && 'hidden')}>
                <p className="text-sm text-slate-400">
                    Vul in welke rijen je hebt gespoten. Leeg laten = het hele perceel.
                </p>
                {metRijen.map(h => (
                    <RijPerceelInvoer
                        key={h.id}
                        perceelId={h.id}
                        perceelNaam={samenvattingPerPerceel.get(h.id)?.perceelNaam || h.naam}
                        samenvatting={samenvattingPerPerceel.get(h.id) ?? null}
                        tekst={teksten[h.id] ?? ''}
                        vorig={resultaten[h.id] ?? null}
                        onTekstChange={onTekstChange}
                        onResultaat={onResultaat}
                    />
                ))}
                {heeftFout && (
                    <p className="text-sm text-amber-400">
                        Pas de rijselectie aan of maak het veld leeg om het hele perceel te kiezen.
                    </p>
                )}
            </div>
        </div>
    );
}

// ============================================
// Invoer per hoofdperceel
// ============================================

interface RijPerceelInvoerProps {
    perceelId: string;
    perceelNaam: string;
    samenvatting: RijenSamenvatting | null;
    tekst: string;
    /** Laatst gemelde resultaat (bv. van vóór een stap terug); een geldig 'ok' wordt hergebruikt */
    vorig: RijPerceelResultaat | null;
    onTekstChange: (perceelId: string, tekst: string) => void;
    onResultaat: (resultaat: RijPerceelResultaat) => void;
}

interface OppervlakStand {
    sleutel: string;
    oppervlak: RijSelectieOppervlakPerceel | null;
    fout: string | null;
}

function RijPerceelInvoer({ perceelId, perceelNaam, samenvatting, tekst, vorig, onTekstChange, onResultaat }: RijPerceelInvoerProps) {
    const heeftTekst = tekst.trim().length > 0;
    // Rijen pas laden als er iets is ingevuld
    const kaartQuery = useRijenkaart(heeftTekst ? perceelId : null);
    useVersBijTonen(kaartQuery, heeftTekst);
    const { data: kaart, error } = kaartQuery;

    const parse = React.useMemo(() => {
        if (!heeftTekst || !kaart) return null;
        return parseRijSelectie(tekst, kaart.rijen, kaart.blokken.map(b => ({ id: b.id, naam: b.naam })));
    }, [heeftTekst, kaart, tekst]);

    const sleutel = parse && parse.fouten.length === 0 && !parse.leeg ? parse.rijIds.join(',') : '';

    // Terug naar deze stap: een geldig resultaat voor dezelfde tekst niet opnieuw laten berekenen
    // (anders staat "Volgende" even geblokkeerd en gaat er een extra verzoek uit).
    const [stand, setStand] = React.useState<OppervlakStand | null>(() =>
        vorig && vorig.status === 'ok' && vorig.oppervlak && vorig.sleutel && vorig.tekst.trim() === tekst.trim()
            ? { sleutel: vorig.sleutel, oppervlak: vorig.oppervlak, fout: null }
            : null,
    );
    const standSleutel = stand?.sleutel ?? null;
    React.useEffect(() => {
        if (!sleutel || standSleutel === sleutel) return;
        let actief = true;
        const timer = setTimeout(async () => {
            try {
                const res = await rijSelectieOppervlakAction(sleutel.split(','));
                if (!actief) return;
                const deel = res.perPerceel.find(p => p.perceelId === perceelId) ?? null;
                setStand({ sleutel, oppervlak: deel, fout: deel ? null : 'Geen rijen van dit perceel gevonden.' });
            } catch (e) {
                if (actief) setStand({ sleutel, oppervlak: null, fout: rijenFoutmelding(e, 'Rijselectie kon niet worden berekend.') });
            }
        }, 350);
        return () => {
            actief = false;
            clearTimeout(timer);
        };
    }, [sleutel, perceelId, standSleutel]);

    const resultaat = React.useMemo((): RijPerceelResultaat => {
        const basis = { perceelId, tekst, oppervlak: null };
        if (!heeftTekst) return { ...basis, status: 'leeg', fouten: [] };
        // Een mislukte achtergrond-verversing met nog bruikbare data blokkeert niet
        if (kaart === undefined) {
            if (error) return { ...basis, status: 'fout', fouten: [rijenFoutmelding(error, 'Rijen konden niet worden geladen.')] };
            return { ...basis, status: 'bezig', fouten: [] };
        }
        if (kaart === null) return { ...basis, status: 'fout', fouten: ['Perceel niet gevonden.'] };
        if (!parse) return { ...basis, status: 'bezig', fouten: [] };
        if (parse.fouten.length > 0) return { ...basis, status: 'fout', fouten: parse.fouten };
        if (parse.leeg) return { ...basis, status: 'fout', fouten: ['Geen rijen geselecteerd.'] };
        if (!stand || stand.sleutel !== sleutel) return { ...basis, status: 'bezig', fouten: [] };
        if (stand.fout || !stand.oppervlak) return { ...basis, status: 'fout', fouten: [stand.fout ?? 'Rijselectie kon niet worden berekend.'] };
        return { ...basis, status: 'ok', fouten: [], oppervlak: stand.oppervlak, sleutel };
    }, [perceelId, tekst, heeftTekst, error, kaart, parse, stand, sleutel]);

    React.useEffect(() => {
        onResultaat(resultaat);
    }, [resultaat, onResultaat]);

    const bereik = samenvatting && samenvatting.aantalActief > 0
        ? `${samenvatting.aantalActief} ${samenvatting.aantalActief === 1 ? 'rij' : 'rijen'}${samenvatting.minNummer !== null && samenvatting.maxNummer !== null ? ` (${samenvatting.minNummer === samenvatting.maxNummer ? samenvatting.minNummer : `${samenvatting.minNummer}–${samenvatting.maxNummer}`})` : ''}`
        : null;

    return (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-white truncate">{perceelNaam}</span>
                {bereik && <span className="text-xs text-slate-500 tabular-nums shrink-0">{bereik}</span>}
            </div>

            <div className="relative">
                <Input
                    value={tekst}
                    onChange={e => onTekstChange(perceelId, e.target.value)}
                    onKeyDown={e => {
                        // iPhone: "gereed" sluit het toetsenbord (er is geen formulier om te versturen)
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                        }
                    }}
                    placeholder="Rijen: bv. 1-20, 24 of bloknaam"
                    aria-label={`Rijen van ${perceelNaam}`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="done"
                    className="h-12 text-base pr-12 bg-white/[0.02] border-white/10"
                />
                {heeftTekst && (
                    <button
                        type="button"
                        onClick={() => onTekstChange(perceelId, '')}
                        aria-label="Rijselectie wissen"
                        className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-slate-400 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {resultaat.status === 'leeg' && (
                <p className="text-sm text-slate-500">Hele perceel{samenvatting ? ` (RVO ${formatHa(samenvatting.oppervlakHa)} ha)` : ''}</p>
            )}
            {resultaat.status === 'bezig' && (
                <p className="text-sm text-slate-400 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rijen berekenen…
                </p>
            )}
            {resultaat.status === 'fout' && (
                <div className="space-y-1">
                    {resultaat.fouten.map(f => (
                        <p key={f} className="text-sm text-red-400 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{f}</span>
                        </p>
                    ))}
                </div>
            )}
            {resultaat.status === 'ok' && resultaat.oppervlak && (
                <p className="text-sm text-emerald-400 flex items-start gap-2">
                    <Check className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                        {resultaat.oppervlak.rijIds.length} {resultaat.oppervlak.rijIds.length === 1 ? 'rij' : 'rijen'}
                        {' · '}{formatHa(resultaat.oppervlak.oppervlakHa)} ha behandeld
                        <span className="text-slate-500"> (RVO {formatHa(resultaat.oppervlak.rvoOppervlakHa)} ha)</span>
                    </span>
                </p>
            )}
        </div>
    );
}

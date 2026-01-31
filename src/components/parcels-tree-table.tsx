"use client"

import * as React from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Parcel, SubParcel } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Calendar, Droplets, Leaf, ChevronRight, ChevronDown, LayoutDashboard, Trash2, ArrowUpDown } from "lucide-react"

import { useRouter } from "next/navigation"

interface ParcelsTreeTableProps {
    parcels: Parcel[]
    onSubParcelClick: (subParcel: SubParcel) => void
    onParcelClick: (parcel: Parcel) => void
    onDeleteParcel?: (parcelId: string) => void
}

type SortKey = 'name' | 'area' | 'crop' | 'year';
type SortDirection = 'asc' | 'desc';

export function ParcelsTreeTable({ parcels, onSubParcelClick, onParcelClick, onDeleteParcel }: ParcelsTreeTableProps) {
    const router = useRouter();
    const [expandedParcels, setExpandedParcels] = React.useState<Set<string>>(new Set());
    const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: SortDirection }>({
        key: 'name',
        direction: 'asc'
    });

    const toggleExpand = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedParcels);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedParcels(newExpanded);
    };

    const getParentCropText = (parcel: Parcel) => {
        if (!parcel.subParcels || parcel.subParcels.length === 0) return "-";
        const crops = Array.from(new Set(parcel.subParcels.map(s => s.crop)));
        if (crops.length === 1) return crops[0];
        if (crops.length === 2) return crops.join(" & ");
        return "Mix";
    };

    const getWeightedYear = (parcel: Parcel) => {
        if (!parcel.subParcels || parcel.subParcels.length === 0) return null;
        const validSubs = parcel.subParcels.filter(s => s.plantingYear != null || (s.plantingYears && s.plantingYears.length > 0));
        if (validSubs.length === 0) return null;

        const totalAreaForYear = validSubs.reduce((sum, s) => sum + s.area, 0);
        const weightedSum = validSubs.reduce((sum, s) => {
            let year = 0;
            if (s.plantingYears && s.plantingYears.length > 0) {
                year = s.plantingYears.reduce((ySum, py) => ySum + (py.value * (py.percentage / 100)), 0);
            } else {
                year = s.plantingYear || 0;
            }
            return sum + (year * s.area);
        }, 0);

        return totalAreaForYear > 0 ? Math.round(weightedSum / totalAreaForYear) : null;
    };

    const getSubParcelTrees = (sub: SubParcel) => {
        const distances = sub.plantingDistances || [];
        if (distances.length > 0) {
            let totalWeightedBomen = 0;
            distances.forEach(d => {
                if (d.value.row > 0 && d.value.tree > 0) {
                    const bomenPerHa = 10000 / (d.value.row * d.value.tree);
                    totalWeightedBomen += bomenPerHa * (d.percentage / 100);
                }
            });
            return Math.round(totalWeightedBomen * sub.area);
        }
        if (sub.plantingDistanceRow && sub.plantingDistanceTree) {
            return Math.round((10000 / (sub.plantingDistanceRow * sub.plantingDistanceTree)) * sub.area);
        }
        return 0;
    };

    const totalArea = parcels.reduce((sum, p) => sum + p.area, 0);
    const totalTrees = parcels.reduce((sum, p) =>
        sum + (p.subParcels?.reduce((sSum, sub) => sSum + getSubParcelTrees(sub), 0) || 0)
        , 0);

    const sortedParcels = React.useMemo(() => {
        const sorted = [...parcels];
        sorted.sort((a, b) => {
            let valA: any, valB: any;

            switch (sortConfig.key) {
                case 'name':
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    break;
                case 'area':
                    valA = a.area;
                    valB = b.area;
                    break;
                case 'crop':
                    valA = getParentCropText(a);
                    valB = getParentCropText(b);
                    break;
                case 'year':
                    valA = getWeightedYear(a) || 0;
                    valB = getWeightedYear(b) || 0;
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [parcels, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ k }: { k: SortKey }) => (
        <ArrowUpDown className={cn(
            "h-3 w-3 ml-1 transition-colors",
            sortConfig.key === k ? "text-primary" : "text-white/20"
        )} />
    );

    return (
        <div className="rounded-xl border border-white/10 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl">
            <Table>
                <TableHeader className="bg-white/5">
                    <TableRow className="hover:bg-transparent border-white/10">
                        <TableHead className="w-[30px]"></TableHead>
                        <TableHead
                            className="cursor-pointer group text-white/50 font-bold uppercase tracking-wider text-[10px]"
                            onClick={() => handleSort('name')}
                        >
                            <div className="flex items-center">Naam <SortIcon k="name" /></div>
                        </TableHead>
                        <TableHead
                            className="cursor-pointer group text-right text-white/50 font-bold uppercase tracking-wider text-[10px]"
                            onClick={() => handleSort('area')}
                        >
                            <div className="flex items-center justify-end">Oppervlakte <SortIcon k="area" /></div>
                        </TableHead>
                        <TableHead
                            className="cursor-pointer group text-white/50 font-bold uppercase tracking-wider text-[10px]"
                            onClick={() => handleSort('crop')}
                        >
                            <div className="flex items-center">Gewas/Ras <SortIcon k="crop" /></div>
                        </TableHead>
                        <TableHead
                            className="cursor-pointer group text-right text-white/50 font-bold uppercase tracking-wider text-[10px]"
                            onClick={() => handleSort('year')}
                        >
                            <div className="flex items-center justify-end">Plantjaar <SortIcon k="year" /></div>
                        </TableHead>
                        <TableHead className="text-white/50 font-bold uppercase tracking-wider text-[10px]">Status</TableHead>
                        <TableHead className="text-right text-white/50 font-bold uppercase tracking-wider text-[10px]">Acties</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedParcels.map((parcel) => {
                        const isExpanded = expandedParcels.has(parcel.id);
                        const parentCrop = getParentCropText(parcel);
                        const weightedYear = getWeightedYear(parcel);

                        return (
                            <React.Fragment key={parcel.id}>
                                {/* Parent Row */}
                                <TableRow
                                    className={cn(
                                        "bg-white/5 border-white/5 hover:bg-white/10 transition-colors cursor-pointer group/parent",
                                        isExpanded && "bg-white/[0.08]"
                                    )}
                                    onClick={() => onParcelClick(parcel)}
                                >
                                    <TableCell
                                        className="p-0 text-center"
                                        onClick={(e) => toggleExpand(parcel.id, e)}
                                    >
                                        <div className="flex justify-center items-center w-full h-full py-4">
                                            {isExpanded ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-black text-white py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-6 bg-primary rounded-full" />
                                            <div className="flex flex-col">
                                                <span>{parcel.name}</span>
                                                <span className="text-[9px] text-primary font-black uppercase tracking-widest flex items-center gap-1 opacity-0 group-hover/parent:opacity-100 transition-opacity">
                                                    <LayoutDashboard className="h-2 w-2" /> Dashboard
                                                </span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono font-bold text-white/90 text-right">
                                        {parcel.area.toFixed(2)} ha
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs font-bold text-white/70">{parentCrop}</span>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm text-white/60">
                                        {weightedYear || <span className="text-white/20 italic">gem. n.v.t.</span>}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-[10px] border-white/10 text-white/40">
                                            {parcel.subParcels?.length || 0} Blokken
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {onDeleteParcel && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteParcel(parcel.id);
                                                    }}
                                                    className="p-2 text-white/10 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-all"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                            <ChevronRight className="h-4 w-4 text-white/20 group-hover/parent:text-primary transition-colors" />
                                        </div>
                                    </TableCell>
                                </TableRow>

                                {/* Child Rows */}
                                {isExpanded && (parcel.subParcels || []).map((sub) => (
                                    <TableRow
                                        key={sub.id}
                                        className="border-white/5 hover:bg-primary/5 cursor-pointer transition-all group animate-in slide-in-from-top-1 duration-200"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSubParcelClick(sub);
                                        }}
                                    >
                                        <TableCell />
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-1 h-4 rounded-full",
                                                    sub.crop === 'Appel' ? "bg-rose-500/50" : "bg-emerald-500/50"
                                                )} />
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm text-white/80 group-hover:text-primary transition-colors">
                                                        {sub.name || sub.variety}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm text-white/60 text-right">
                                            {sub.area.toFixed(2)} ha
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-white/60">{sub.variety}</span>
                                                <span className={cn(
                                                    "text-[9px] uppercase font-black tracking-widest",
                                                    sub.crop === 'Appel' ? "text-rose-400/60" : "text-emerald-400/60"
                                                )}>{sub.crop}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {sub.plantingYear ? (
                                                <span className="text-white/60">{sub.plantingYear}</span>
                                            ) : (
                                                <span className="text-white/10 text-xs italic">n.v.t.</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {sub.soilSamples && sub.soilSamples.length > 0 ? (
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "h-1.5 w-1.5 rounded-full shadow-[0_0_8px]",
                                                        (sub.soilSamples[0].ph || 0) > 6 ? "bg-emerald-500 shadow-emerald-500/50" : "bg-amber-500 shadow-amber-500/50"
                                                    )} />
                                                    <span className="text-[10px] text-white/40 font-medium">pH {(sub.soilSamples[0].ph || 0).toFixed(1)}</span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-white/20">Geen data</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {sub.irrigationType && sub.irrigationType !== 'Geen' && (
                                                    <Droplets className="h-3.5 w-3.5 text-blue-400/60" />
                                                )}
                                                <Calendar className="h-3.5 w-3.5 text-amber-400/60" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </React.Fragment>
                        );
                    })}

                    {/* Summary Row */}
                    <TableRow
                        className="bg-primary/10 border-t-2 border-primary/20 hover:bg-primary/20 cursor-pointer transition-all group"
                        onClick={() => router.push('/bedrijf-dashboard')}
                    >
                        <TableCell />
                        <TableCell className="py-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/20 rounded-lg">
                                    <LayoutDashboard className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-black text-white group-hover:text-primary transition-colors">Uw Bedrijf</span>
                                    <span className="text-[10px] uppercase font-black text-white/40 tracking-widest">Totaal Overzicht & Dashboards</span>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex flex-col">
                                <span className="text-lg font-black text-white">{totalArea.toFixed(2)} ha</span>
                                <span className="text-[10px] uppercase font-bold text-white/30">Totale Oppervlakte</span>
                            </div>
                        </TableCell>
                        <TableCell colSpan={2} className="text-right px-10">
                            <div className="flex flex-col">
                                <span className="text-lg font-black text-primary">{totalTrees.toLocaleString()} bomen</span>
                                <span className="text-[10px] uppercase font-bold text-white/30">Totaal Bedrijfsomvang</span>
                            </div>
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2 pr-2">
                                <span className="text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                                    Naar Dashboard
                                </span>
                                <ChevronRight className="h-6 w-6 text-primary animate-pulse" />
                            </div>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    );
}

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, X, Layers, Combine, Split } from "lucide-react";
import type { RvoParcel } from "@/lib/types";
import { calculateAreaHectares } from "@/lib/rvo-api";
import { cn } from "@/lib/utils";

interface RvoMultiSelectBarProps {
    selectedParcels: RvoParcel[];
    onCancel: () => void;
    onAddSelected: (merge: boolean) => void;
}

export function RvoMultiSelectBar({
    selectedParcels,
    onCancel,
    onAddSelected,
}: RvoMultiSelectBarProps) {
    if (selectedParcels.length === 0) return null;

    const totalArea = selectedParcels.reduce((sum, p) => {
        return sum + calculateAreaHectares(p.geometry);
    }, 0);

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-2xl animate-in slide-in-from-bottom-8 duration-300">
            <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                        <Layers className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-black text-white">
                            {selectedParcels.length} vlakken geselecteerd
                        </p>
                        <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">
                            Totaal: {totalArea.toFixed(2)} ha
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onCancel}
                        className="text-white/40 hover:text-white"
                    >
                        <X className="h-4 w-4 mr-2" />
                        Annuleren
                    </Button>

                    <div className="h-8 w-[1px] bg-white/10 mx-2" />

                    {selectedParcels.length > 1 ? (
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onAddSelected(false)}
                                className="border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold"
                            >
                                <Split className="h-4 w-4 mr-2" />
                                Los toevoegen
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => onAddSelected(true)}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-6 shadow-lg shadow-primary/20"
                            >
                                <Combine className="h-4 w-4 mr-2" />
                                Samenvoegen
                            </Button>
                        </div>
                    ) : (
                        <Button
                            size="sm"
                            onClick={() => onAddSelected(false)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-6 shadow-lg shadow-primary/20"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Toevoegen
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

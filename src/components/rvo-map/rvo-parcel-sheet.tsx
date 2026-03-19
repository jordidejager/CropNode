"use client";

import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Wheat, Hash, Calendar, CheckCircle2, Sprout, Loader2 } from "lucide-react";
import type { RvoParcel } from "@/lib/types";
import { calculateAreaHectares, calculateCenter } from "@/lib/rvo-api";
import { fetchBrpHistorie, type BrpFetchResult } from "@/lib/brp-history";

const cropGroupColors: Record<string, { bg: string; text: string }> = {
  Fruit: { bg: "bg-emerald-500/20", text: "text-emerald-500" },
  Grasland: { bg: "bg-lime-500/20", text: "text-lime-500" },
  Akkerbouw: { bg: "bg-amber-500/20", text: "text-amber-500" },
  Overig: { bg: "bg-slate-500/20", text: "text-slate-400" },
};

interface RvoParcelSheetProps {
  parcel: RvoParcel | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAddParcel: (parcel: RvoParcel) => void;
}

export function RvoParcelSheet({
  parcel,
  isOpen,
  onOpenChange,
  onAddParcel,
}: RvoParcelSheetProps) {
  const [brpData, setBrpData] = useState<BrpFetchResult[]>([]);
  const [brpLoading, setBrpLoading] = useState(false);

  // Fetch BRP data when parcel changes
  useEffect(() => {
    if (!parcel || !isOpen) {
      setBrpData([]);
      return;
    }

    const controller = new AbortController();
    setBrpLoading(true);
    setBrpData([]);

    const center = calculateCenter(parcel.geometry);
    fetchBrpHistorie(center.lat, center.lng)
      .then((results) => {
        if (!controller.signal.aborted) {
          setBrpData(results);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBrpData([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBrpLoading(false);
        }
      });

    return () => controller.abort();
  }, [parcel?.id, isOpen]);

  if (!parcel) return null;

  const { properties, geometry } = parcel;
  const areaHa = calculateAreaHectares(geometry);

  const handleAdd = () => {
    onAddParcel(parcel);
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wheat className="h-5 w-5" />
            RVO Perceel
          </SheetTitle>
          <SheetDescription>
            Details van het geselecteerde gewasperceel
          </SheetDescription>
        </SheetHeader>

        <div className="py-6 space-y-4">
          {/* Gewas */}
          <div className="flex items-start gap-3">
            <Wheat className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Gewas</p>
              <p className="font-medium">{properties.gewas}</p>
            </div>
          </div>

          <Separator />

          {/* Gewascode */}
          <div className="flex items-start gap-3">
            <Hash className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Gewascode</p>
              <p className="font-medium">{properties.gewascode}</p>
            </div>
          </div>

          <Separator />

          {/* Jaar */}
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Jaar</p>
              <p className="font-medium">{properties.jaar}</p>
            </div>
          </div>

          <Separator />

          {/* Status */}
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant="secondary">{properties.status}</Badge>
            </div>
          </div>

          <Separator />

          {/* Categorie */}
          {properties.category && (
            <>
              <div className="flex items-start gap-3">
                <div className="h-5 w-5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Categorie</p>
                  <p className="font-medium">{properties.category}</p>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Oppervlakte */}
          <div className="flex items-start gap-3">
            <div className="h-5 w-5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Oppervlakte</p>
              <p className="font-medium">{areaHa.toFixed(4)} ha</p>
            </div>
          </div>

          <Separator />

          {/* RVO ID */}
          <div className="flex items-start gap-3">
            <div className="h-5 w-5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">RVO ID</p>
              <p className="font-mono text-xs text-muted-foreground break-all">
                {parcel.id}
              </p>
            </div>
          </div>

          <Separator />

          {/* Gewasrotatie (BRP) */}
          <div className="flex items-start gap-3">
            <Sprout className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">
                Gewasrotatie (BRP)
                {!brpLoading && brpData.length > 1 && (
                  <span className="ml-1 text-[10px]">({brpData.length} jaar)</span>
                )}
              </p>
              {brpLoading && (
                <div className="flex items-center gap-2 mt-1">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Ophalen...</span>
                </div>
              )}
              {!brpLoading && brpData.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Geen BRP data gevonden</p>
              )}
              {!brpLoading && brpData.length > 0 && (
                <div className="overflow-x-auto -mx-1 px-1 mt-1">
                  <div className="flex gap-2" style={{ minWidth: brpData.length > 3 ? 'max-content' : undefined }}>
                    {brpData.map((entry) => {
                      const colors = cropGroupColors[entry.cropGroup] || cropGroupColors.Overig;
                      return (
                        <div
                          key={entry.jaar}
                          className={`${colors.bg} rounded-lg px-3 py-2 border border-white/5 shrink-0`}
                          title={`${entry.jaar}: ${entry.gewas} (code ${entry.gewascode})`}
                        >
                          <p className="text-[10px] font-bold text-muted-foreground">{entry.jaar}</p>
                          <p className={`text-sm font-semibold ${colors.text} whitespace-nowrap`}>{entry.gewas}</p>
                          <p className="text-[10px] text-muted-foreground">{entry.cropGroup}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleAdd} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Toevoegen aan mijn percelen
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

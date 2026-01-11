"use client";

import React from "react";
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
import { Plus, Wheat, Hash, Calendar, CheckCircle2 } from "lucide-react";
import type { RvoParcel } from "@/lib/types";
import { calculateAreaHectares } from "@/lib/rvo-api";

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
                <div className="h-5 w-5" /> {/* Spacer for alignment */}
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
            <div className="h-5 w-5" /> {/* Spacer for alignment */}
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Oppervlakte</p>
              <p className="font-medium">{areaHa.toFixed(4)} ha</p>
            </div>
          </div>

          <Separator />

          {/* RVO ID */}
          <div className="flex items-start gap-3">
            <div className="h-5 w-5" /> {/* Spacer for alignment */}
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">RVO ID</p>
              <p className="font-mono text-xs text-muted-foreground break-all">
                {parcel.id}
              </p>
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

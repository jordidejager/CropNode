"use client";

import React, { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useFirestore } from "@/firebase";
import { addParcel, getParcels } from "@/lib/store";
import { ParcelFormDialog, type RvoData } from "@/components/parcel-form-dialog";
import { RvoParcelSheet } from "@/components/rvo-map/rvo-parcel-sheet";
import type { RvoParcel, Parcel } from "@/lib/types";
import { calculateAreaHectares, calculateCenter } from "@/lib/rvo-api";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

// Dynamic import to prevent SSR issues with Leaflet
const RvoMap = dynamic(
  () => import("@/components/rvo-map/rvo-map").then((m) => m.RvoMap),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  }
);

function MapSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-muted">
      <div className="text-center space-y-4">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
      </div>
    </div>
  );
}

export default function RvoKaartPage() {
  const db = useFirestore();
  const { toast } = useToast();

  const [selectedParcel, setSelectedParcel] = useState<RvoParcel | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [rvoDataForForm, setRvoDataForForm] = useState<RvoData | null>(null);
  const [userParcels, setUserParcels] = useState<Parcel[]>([]);

  // Load user parcels
  const loadUserParcels = useCallback(async () => {
    if (!db) return;
    try {
      const parcels = await getParcels(db);
      setUserParcels(parcels);
    } catch (error) {
      console.error("Error loading user parcels:", error);
    }
  }, [db]);

  useEffect(() => {
    loadUserParcels();
  }, [loadUserParcels]);

  // Handle parcel selection from map
  const handleParcelSelect = useCallback((parcel: RvoParcel | null) => {
    setSelectedParcel(parcel);
    setIsSheetOpen(parcel !== null);
  }, []);

  // Handle "Add to my parcels" from sheet
  const handleAddParcel = useCallback((parcel: RvoParcel) => {
    const center = calculateCenter(parcel.geometry);
    const area = calculateAreaHectares(parcel.geometry);

    // Prepare data for the form dialog
    setRvoDataForForm({
      name: `RVO ${parcel.properties.gewascode}`,
      area: area,
      location: center,
      geometry: parcel.geometry,
    });
    setIsSheetOpen(false);
    setIsFormOpen(true);
  }, []);

  // Handle form submission
  const handleFormSubmit = useCallback(
    async (data: any) => {
      if (!db) return;

      try {
        await addParcel(db, {
          name: data.name,
          crop: data.crop,
          variety: data.variety,
          area: data.area,
          location: data.location,
          geometry: data.geometry,
          source: "RVO_IMPORT",
          rvoId: selectedParcel?.id,
        });

        toast({
          title: "Perceel toegevoegd",
          description: `${data.name} is opgeslagen in je percelen.`,
        });

        setSelectedParcel(null);
        // Reload user parcels to show the new one on the map
        loadUserParcels();
      } catch (error) {
        console.error("Error adding parcel:", error);
        toast({
          variant: "destructive",
          title: "Fout",
          description: "Er is een fout opgetreden bij het opslaan.",
        });
      }
    },
    [db, selectedParcel, toast, loadUserParcels]
  );

  return (
    <div className="h-full w-full relative">
      <RvoMap
        onParcelSelect={handleParcelSelect}
        selectedParcel={selectedParcel}
        userParcels={userParcels}
      />

      <RvoParcelSheet
        parcel={selectedParcel}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onAddParcel={handleAddParcel}
      />

      <ParcelFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        parcel={null}
        rvoData={rvoDataForForm}
        onSubmit={handleFormSubmit}
        userParcels={userParcels}
      />
    </div>
  );
}


"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useForm, Controller, SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import type { Parcel, RvoParcel } from "@/lib/types"
import { appleVarieties, pearVarieties } from "@/lib/data"
import { MapPin, Check, X } from "lucide-react"
import dynamic from "next/dynamic"

const RvoMap = dynamic(
  () => import('./rvo-map/rvo-map').then((mod) => mod.RvoMap),
  { ssr: false }
);


// Helper to convert coordinates to GeoJSON polygon and calculate center
function coordinatesToGeometry(coords: { lat: number; lng: number }[]) {
  if (coords.length < 3) return { geometry: null, center: null };

  // Create closed polygon (first point = last point)
  const closedCoords = [...coords];
  if (closedCoords[0].lat !== closedCoords[closedCoords.length - 1].lat ||
      closedCoords[0].lng !== closedCoords[closedCoords.length - 1].lng) {
    closedCoords.push(closedCoords[0]);
  }

  const geometry = {
    type: "Polygon",
    coordinates: [closedCoords.map(c => [c.lng, c.lat])]
  };

  // Calculate center (simple centroid)
  const center = {
    lat: coords.reduce((sum, c) => sum + c.lat, 0) / coords.length,
    lng: coords.reduce((sum, c) => sum + c.lng, 0) / coords.length
  };

  return { geometry, center };
}

export type RvoData = {
    area: number;
    location: { lat: number, lng: number };
    geometry: any;
    name: string;
}


const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Naam is verplicht"),
  crop: z.string().min(1, "Gewas is verplicht"),
  variety: z.string().min(1, "Ras is verplicht"),
  area: z.coerce.number().min(0.01, "Oppervlakte moet groter dan 0 zijn"),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  geometry: z.any().optional(),
})

type ParcelFormValues = z.infer<typeof formSchema>

interface ParcelFormDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  parcel: Parcel | null
  rvoData?: RvoData | null
  onSubmit: (data: ParcelFormValues) => Promise<void>
}

export function ParcelFormDialog({
  isOpen,
  onOpenChange,
  parcel,
  rvoData,
  onSubmit,
}: ParcelFormDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    control,
    watch,
    setValue,
    getValues,
  } = useForm<ParcelFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: undefined,
      name: "",
      crop: "",
      variety: "",
      area: 0.0,
      location: undefined,
      geometry: undefined
    },
  })

  const watchedCrop = watch("crop")
  const watchedLocation = watch("location")
  const watchedGeometry = watch("geometry")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [tempGeometry, setTempGeometry] = useState<any>(null);

  const varietyOptions = useMemo(() => {
    if (watchedCrop?.toLowerCase() === "appel") {
      return appleVarieties
    } else if (watchedCrop?.toLowerCase() === "peer") {
      return pearVarieties
    }
    return []
  }, [watchedCrop])

  useEffect(() => {
    if (isOpen) {
      if (parcel) {
        reset({ ...parcel, location: parcel.location || undefined, geometry: parcel.geometry || undefined });
      } else if (rvoData) {
        reset({
          id: undefined,
          name: rvoData.name,
          crop: "",
          variety: "",
          area: rvoData.area,
          location: rvoData.location,
          geometry: rvoData.geometry
        });
      } else {
        reset({
          id: undefined,
          name: "",
          crop: "",
          variety: "",
          area: 0.0,
          location: undefined,
          geometry: undefined
        })
      }
    }
  }, [parcel, rvoData, isOpen, reset])

  useEffect(() => {
    const currentVariety = getValues("variety");
    if (watchedCrop && currentVariety && !varietyOptions.includes(currentVariety)) {
      setValue('variety', '');
    }
  }, [watchedCrop, varietyOptions, setValue, getValues]);


  const handleClose = () => {
    onOpenChange(false)
  }

  const handleOpenMap = () => {
    setTempGeometry(watchedGeometry || null);
    setIsMapOpen(true);
  };

  const handleMapSave = useCallback((geometry: any) => {
    setTempGeometry(geometry);
  }, []);

  const handleConfirmLocation = () => {
    if (tempGeometry) {
      const coords = tempGeometry.coordinates[0].slice(0, -1).map((c: number[]) => ({ lat: c[1], lng: c[0] }));
      const center = {
        lat: coords.reduce((sum: number, c: { lat: number }) => sum + c.lat, 0) / coords.length,
        lng: coords.reduce((sum: number, c: { lng: number }) => sum + c.lng, 0) / coords.length
      };
      setValue("geometry", tempGeometry);
      setValue("location", center);
    } else {
      // Handle case where geometry was deleted
      setValue("geometry", undefined);
      setValue("location", undefined);
    }
    setIsMapOpen(false);
  };

  const handleCancelMap = () => {
    setTempGeometry(null);
    setIsMapOpen(false);
  };

  const handleClearLocation = () => {
    setValue("geometry", undefined);
    setValue("location", undefined);
  };

  const processSubmit: SubmitHandler<ParcelFormValues> = async (data) => {
    setIsSubmitting(true)
    await onSubmit(data)
    setIsSubmitting(false)
    handleClose()
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {parcel ? "Perceel Aanpassen" : "Nieuw Perceel Toevoegen"}
            </DialogTitle>
            <DialogDescription>
              {parcel ? "Pas de gegevens van het perceel aan." : "Voer de gegevens voor het nieuwe perceel in."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(processSubmit)} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Naam
              </Label>
              <div className="col-span-3">
                <Input id="name" {...register("name")} className="w-full" />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="crop" className="text-right">
                Gewas
              </Label>
              <div className="col-span-3">
                <Controller
                  control={control}
                  name="crop"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Kies een gewas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Appel">Appel</SelectItem>
                        <SelectItem value="Peer">Peer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.crop && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.crop.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="variety" className="text-right">
                Ras
              </Label>
              <div className="col-span-3">
                <Controller
                  control={control}
                  name="variety"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value} disabled={!watchedCrop}>
                      <SelectTrigger>
                        <SelectValue placeholder="Kies een ras" />
                      </SelectTrigger>
                      <SelectContent>
                        {varietyOptions.map((variety) => (
                          <SelectItem key={variety} value={variety}>
                            {variety}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.variety && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.variety.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="area" className="text-right">
                Opp. (ha)
              </Label>
              <div className="col-span-3">
                <Input
                  id="area"
                  type="number"
                  step="0.0001"
                  {...register("area")}
                  className="w-full"
                />
                {errors.area && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.area.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4 pt-2">
              <Label className="text-right mt-2">
                Locatie
              </Label>
              <div className="col-span-3">
                {watchedLocation ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-sm bg-muted text-muted-foreground rounded-md px-3 py-2 flex items-center gap-2">
                       <Check className="h-4 w-4 text-green-500" />
                       Locatie ingesteld
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleOpenMap}>
                      Wijzig
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={handleClearLocation}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={handleOpenMap} className="w-full">
                    <MapPin className="mr-2 h-4 w-4" />
                    Locatie aanwijzen op kaart
                  </Button>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Opslaan..." : "Opslaan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Map Dialog for location selection */}
      <Dialog open={isMapOpen} onOpenChange={(open) => !open && handleCancelMap()}>
        <DialogContent className="w-full max-w-[90vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Locatie aanwijzen</DialogTitle>
            <DialogDescription>
              Teken het perceel op de kaart door punten te plaatsen. Klik op het polygon icoon links om te beginnen. De RVO percelen zijn zichtbaar als referentie.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-md overflow-hidden border">
             <RvoMap
                onParcelSelect={() => {}} // Not needed in drawing mode
                selectedParcel={null}
                isDrawingEnabled={true}
                onGeometryChange={handleMapSave}
                initialGeometry={tempGeometry || watchedGeometry}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancelMap}>
              Annuleren
            </Button>
            <Button type="button" onClick={handleConfirmLocation}>
              <Check className="mr-2 h-4 w-4" />
              Locatie Bevestigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

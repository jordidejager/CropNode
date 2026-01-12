
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
  userParcels?: Parcel[]
}

export function ParcelFormDialog({
  isOpen,
  onOpenChange,
  parcel,
  rvoData,
  onSubmit,
  userParcels = [],
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
  const [selectedRvoParcel, setSelectedRvoParcel] = useState<RvoParcel | null>(null);

  const varietyOptions = useMemo(() => {
    if (watchedCrop?.toLowerCase() === "appel") {
      return appleVarieties
    } else if (watchedCrop?.toLowerCase() === "peer") {
      return pearVarieties
    }
    return [];
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
    // Only clear variety if crop changed and current variety was from a different crop's list
    if (watchedCrop && currentVariety) {
      const isFromOtherCrop =
        (watchedCrop.toLowerCase() === "appel" && pearVarieties.includes(currentVariety)) ||
        (watchedCrop.toLowerCase() === "peer" && appleVarieties.includes(currentVariety));
      if (isFromOtherCrop) {
        setValue('variety', '');
      }
    }
  }, [watchedCrop, setValue, getValues]);


  const handleClose = () => {
    onOpenChange(false)
  }

  const handleOpenMap = () => {
    setSelectedRvoParcel(null);
    setIsMapOpen(true);
  };

  const handleRvoParcelSelect = useCallback((parcel: RvoParcel | null) => {
    setSelectedRvoParcel(parcel);
  }, []);

  const handleConfirmLocation = () => {
    if (selectedRvoParcel) {
      const geometry = selectedRvoParcel.geometry;
      // Calculate center from geometry
      const coords = geometry.coordinates[0];
      const center = {
        lat: coords.reduce((sum: number, c: number[]) => sum + c[1], 0) / coords.length,
        lng: coords.reduce((sum: number, c: number[]) => sum + c[0], 0) / coords.length
      };
      setValue("geometry", geometry);
      setValue("location", center);
    }
    setSelectedRvoParcel(null);
    setIsMapOpen(false);
  };

  const handleCancelMap = () => {
    setSelectedRvoParcel(null);
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
                <Input
                  id="variety"
                  {...register("variety")}
                  list="variety-options"
                  placeholder={watchedCrop ? "Kies of typ een ras" : "Kies eerst een gewas"}
                  disabled={!watchedCrop}
                  className="w-full"
                />
                <datalist id="variety-options">
                  {varietyOptions.map((variety) => (
                    <option key={variety} value={variety} />
                  ))}
                </datalist>
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

      {/* Map Dialog for RVO parcel selection - only render when open to prevent memory issues */}
      {isMapOpen && (
        <Dialog open={isMapOpen} onOpenChange={(open) => !open && handleCancelMap()}>
          <DialogContent className="w-full max-w-[90vw] h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>RVO Perceel selecteren</DialogTitle>
              <DialogDescription>
                Zoom in op de kaart en klik op een RVO perceel om de grenzen over te nemen.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 rounded-md overflow-hidden border">
               <RvoMap
                  onParcelSelect={handleRvoParcelSelect}
                  selectedParcel={selectedRvoParcel}
                  userParcels={userParcels}
              />
            </div>
            {selectedRvoParcel && (
              <div className="bg-muted rounded-md px-4 py-3 flex items-center gap-3">
                <Check className="h-5 w-5 text-green-500" />
                <div className="flex-1">
                  <p className="font-medium">{selectedRvoParcel.properties.gewas}</p>
                  <p className="text-sm text-muted-foreground">
                    Code: {selectedRvoParcel.properties.gewascode} | Jaar: {selectedRvoParcel.properties.jaar}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancelMap}>
                Annuleren
              </Button>
              <Button type="button" onClick={handleConfirmLocation} disabled={!selectedRvoParcel}>
                <Check className="mr-2 h-4 w-4" />
                Grenzen overnemen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

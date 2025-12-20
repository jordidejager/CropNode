"use client"

import { useEffect, useState, useMemo } from "react"
import { useForm, Controller, SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import dynamic from 'next/dynamic';
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
import type { Parcel } from "@/lib/types"
import { appleVarieties, pearVarieties } from "@/lib/data"
import { Map, MapPin } from "lucide-react"

const ParcelDrawingMap = dynamic(
  () => import('@/components/parcel-drawing-map').then(m => m.ParcelDrawingMap),
  { ssr: false, loading: () => <p>Kaart laden...</p> }
);


const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Naam is verplicht"),
  crop: z.string().min(1, "Gewas is verplicht"),
  variety: z.string().min(1, "Ras is verplicht"),
  area: z.coerce.number().min(0.01, "Oppervlakte moet groter dan 0 zijn"),
  location: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
})

type ParcelFormValues = z.infer<typeof formSchema>

interface ParcelFormDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  parcel: Parcel | null
  onSubmit: (data: ParcelFormValues) => Promise<boolean>
}

export function ParcelFormDialog({
  isOpen,
  onOpenChange,
  parcel,
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
      location: [],
    },
  })

  const watchedCrop = watch("crop")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapRenderKey, setMapRenderKey] = useState(0);

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
        reset({ ...parcel, location: parcel.location || [] });
      } else {
        reset({
          id: undefined,
          name: "",
          crop: "",
          variety: "",
          area: 0.0,
          location: [],
        })
      }
    }
  }, [parcel, isOpen, reset])

  useEffect(() => {
    const currentVariety = getValues("variety");
    if (watchedCrop && currentVariety && !varietyOptions.includes(currentVariety)) {
      setValue('variety', '');
    }
  }, [watchedCrop, varietyOptions, setValue, getValues]);


  const handleClose = () => {
    onOpenChange(false)
  }

  const openMap = () => {
    setMapRenderKey(prev => prev + 1); // Increment key to force re-render
    setIsMapOpen(true);
  }
  
  const handleMapSave = (coordinates: { lat: number; lng: number }[]) => {
    setValue('location', coordinates);
    setIsMapOpen(false);
  };

  const processSubmit: SubmitHandler<ParcelFormValues> = async (data) => {
    setIsSubmitting(true)
    const success = await onSubmit(data)
    setIsSubmitting(false)
    if (success) {
      handleClose()
    }
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
              {parcel
                ? "Pas de gegevens van het perceel aan."
                : "Voer de gegevens voor het nieuwe perceel in."}
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
                  step="0.01"
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
             <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">
                  Locatie
                </Label>
                <div className="col-span-3">
                  <Button type="button" variant="outline" onClick={openMap} className="w-full">
                    <MapPin className="mr-2 h-4 w-4" /> 
                    {getValues('location') && getValues('location').length > 0 ? 'Locatie Bewerken' : 'Teken op kaart'}
                  </Button>
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
      <Dialog open={isMapOpen} onOpenChange={setIsMapOpen}>
          <DialogContent className="max-w-4xl h-[80vh]">
              <DialogHeader>
                  <DialogTitle>Teken perceel op de kaart</DialogTitle>
                  <DialogDescription>
                      Teken de omtrek van het perceel op de kaart en klik op 'Opslaan' als je klaar bent.
                  </DialogDescription>
              </DialogHeader>
              <div className="h-[calc(80vh-150px)]">
                {isMapOpen && (
                    <ParcelDrawingMap
                        key={mapRenderKey} 
                        parcel={parcel}
                        onSave={handleMapSave}
                    />
                )}
              </div>
          </DialogContent>
      </Dialog>
    </>
  )
}

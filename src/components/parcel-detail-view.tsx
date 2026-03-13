"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Parcel,
    SubParcel,
    SoilSample,
    ProductionHistory,
    SpuitschriftEntry,
    WeightedValue
} from "@/lib/types"
import { updateSubParcel, updateParcelSynonyms } from "@/lib/supabase-store"
import { useInvalidateQueries } from "@/hooks/use-data"
import { useToast } from "@/hooks/use-toast"
import {
    Leaf,
    Droplets,
    Map as MapIcon,
    Activity,
    TrendingUp,
    Calendar,
    Layers,
    FileText,
    Plus,
    ArrowLeft,
    Save,
    X,
    Edit2,
    CloudRain,
    Thermometer
} from "lucide-react"
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from 'recharts'
import { format } from "date-fns"
import { nl } from "date-fns/locale"
import { cn } from "@/lib/utils"

import { WeightedInputGroup } from "@/components/weighted-input-group"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { CreatableSelect } from "@/components/creatable-select"

interface ParcelDetailViewProps {
    subParcel: SubParcel
    onBack: () => void
    soilSamples?: SoilSample[]
    productionHistory?: ProductionHistory[]
}

export function ParcelDetailView({
    subParcel,
    onBack,
    soilSamples = [],
    productionHistory = []
}: ParcelDetailViewProps) {
    const [isEditing, setIsEditing] = React.useState(false)
    const [formData, setFormData] = React.useState<SubParcel>(subParcel)
    const [isSaving, setIsSaving] = React.useState(false)
    const [synonyms, setSynonyms] = React.useState<string[]>(subParcel.synonyms || [])
    const [synonymInput, setSynonymInput] = React.useState('')
    const { invalidateParcels } = useInvalidateQueries()
    const { toast } = useToast()

    // Sync formData if subParcel changes from prop
    React.useEffect(() => {
        // Initialize weighted fields if they don't exist
        const initialized: SubParcel = {
            ...subParcel,
            mutants: subParcel.mutants || (subParcel.varietyMutant ? [{ value: subParcel.varietyMutant, percentage: 100 }] : []),
            rootstocks: subParcel.rootstocks || (subParcel.rootstock ? [{ value: subParcel.rootstock, percentage: 100 }] : []),
            interstocks: subParcel.interstocks || [],
            plantingYears: subParcel.plantingYears || (subParcel.plantingYear ? [{ value: subParcel.plantingYear, percentage: 100 }] : []),
            plantingDistances: subParcel.plantingDistances || (subParcel.plantingDistanceRow && subParcel.plantingDistanceTree ? [{
                value: { row: subParcel.plantingDistanceRow, tree: subParcel.plantingDistanceTree },
                percentage: 100
            }] : [])
        }
        setFormData(initialized)
        setSynonyms(subParcel.synonyms || [])
    }, [subParcel])

    const treesPerHa = React.useMemo(() => {
        const distances = formData.plantingDistances || []
        if (distances.length === 0) return 0

        let totalWeightedBomen = 0
        let totalPercentage = 0

        distances.forEach(d => {
            if (d.value.row > 0 && d.value.tree > 0) {
                const bomenPerHa = 10000 / (d.value.row * d.value.tree)
                totalWeightedBomen += bomenPerHa * (d.percentage / 100)
                totalPercentage += d.percentage
            }
        })

        return totalPercentage > 0 ? Math.round(totalWeightedBomen) : 0
    }, [formData.plantingDistances])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await updateSubParcel(formData)
            toast({ title: 'Opgeslagen', description: 'Stamgegevens succesvol bijgewerkt.' })
            invalidateParcels()
            setIsEditing(false)
        } catch (error) {
            console.error(error)
            toast({ variant: 'destructive', title: 'Fout bij opslaan', description: 'Kon gegevens niet bijwerken.' })
        } finally {
            setIsSaving(false)
        }
    }

    // Prepare trend data for soil samples
    const soilTrendData = React.useMemo(() => {
        return soilSamples
            .slice()
            .sort((a, b) => a.sampleDate.getTime() - b.sampleDate.getTime())
            .map(s => ({
                date: format(s.sampleDate, 'MMM yyyy', { locale: nl }),
                ph: s.ph,
                organicMatter: s.organicMatter,
                nTotal: s.nTotal
            }))
    }, [soilSamples])

    // Prepare production trend data
    const productionData = React.useMemo(() => {
        return productionHistory
            .slice()
            .sort((a, b) => a.year - b.year)
            .map(p => ({
                year: p.year.toString(),
                tonnage: p.tonnage,
                ratio: p.tonnage / subParcel.area
            }))
    }, [productionHistory, subParcel.area])

    const EditField = ({ label, field, type = "text" }: { label: string, field: keyof SubParcel, type?: string }) => (
        <div className="flex flex-col gap-1.5 p-4">
            <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</Label>
            <Input
                type={type}
                value={(formData[field] === undefined || formData[field] === null || Number.isNaN(formData[field] as any)) ? '' : formData[field] as any}
                onChange={(e) => setFormData(prev => ({ ...prev, [field]: type === 'number' ? (e.target.value === '' ? NaN : parseFloat(e.target.value)) : e.target.value }))}
                className="h-8 bg-black/40 border-white/10 text-sm font-bold text-white"
            />
        </div>
    )

    const DisplayField = ({ label, value, highlight = false, icon: Icon }: { label: string, value: any, highlight?: boolean, icon?: any }) => (
        <div className="flex justify-between items-center p-4">
            <div className="flex items-center gap-2">
                {Icon && <Icon className="h-3 w-3 text-white/20" />}
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
            </div>
            <span className={cn("text-sm font-black text-right", highlight ? "text-primary" : "text-white/80")}>
                {value || "-"}
            </span>
        </div>
    )

    const CompositionBar = ({ label, values }: { label: string, values?: WeightedValue<any>[] }) => {
        if (!values || values.length === 0) return null;
        return (
            <div className="space-y-2 p-4 pt-2">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">{label}</span>
                </div>
                <div className="h-6 w-full bg-white/5 rounded-full overflow-hidden flex border border-white/5">
                    {values.map((v, i) => (
                        <div
                            key={i}
                            style={{ width: `${v.percentage}%` }}
                            className={cn(
                                "h-full flex items-center justify-center text-[9px] font-black text-white/90 truncate px-1",
                                i % 3 === 0 ? "bg-emerald-500/60" : i % 3 === 1 ? "bg-emerald-400/40" : "bg-teal-500/50"
                            )}
                            title={`${v.value}: ${v.percentage}%`}
                        >
                            {v.percentage >= 10 && (typeof v.value === 'object' ? `${v.value.row}x${v.value.tree}` : v.value)}
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full hover:bg-white/10 shrink-0">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-black text-white">{subParcel.variety}</h1>
                            <Badge className={cn(
                                "font-bold px-3 border-none",
                                subParcel.crop === 'Appel' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                            )}>
                                {subParcel.crop}
                            </Badge>
                        </div>
                        <p className="text-white/40 font-medium">Blok ID: {subParcel.id.slice(0, 8)}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <Button
                                variant="ghost"
                                onClick={() => { setIsEditing(false); setFormData(subParcel); }}
                                className="text-white/40 hover:text-white"
                            >
                                <X className="h-4 w-4 mr-2" /> Annuleren
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 rounded-full"
                            >
                                <Save className="h-4 w-4 mr-2" /> {isSaving ? "Opslaan..." : "Opslaan"}
                            </Button>
                        </>
                    ) : (
                        <Button
                            onClick={() => setIsEditing(true)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-6 rounded-full shadow-lg shadow-primary/20"
                        >
                            <Edit2 className="h-4 w-4 mr-2" /> Bewerken
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Stats & Data */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Stamgegevens Card */}
                    <Card className="bg-card/30 backdrop-blur-md border-white/5 overflow-hidden shadow-xl">
                        <CardHeader className="bg-white/5 border-b border-white/5 py-4">
                            <CardTitle className="text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
                                <Layers className="h-4 w-4 text-primary" />
                                Stamgegevens
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-white/5">
                                {isEditing ? (
                                    <div className="divide-y divide-white/5 bg-black/20">
                                        <WeightedInputGroup
                                            label="Mutant(en)"
                                            values={formData.mutants || []}
                                            onChange={(val) => setFormData({ ...formData, mutants: val })}
                                            defaultValue=""
                                            renderInput={(val, _, onChange) => (
                                                <CreatableSelect
                                                    value={val}
                                                    onChange={onChange}
                                                    options={formData.crop === 'Appel' ? ["Red Prince", "Nicored"] : []}
                                                    placeholder="Zoek of typ mutant..."
                                                />
                                            )}
                                        />
                                        <WeightedInputGroup
                                            label="Onderstam(men)"
                                            values={formData.rootstocks || []}
                                            onChange={(val) => setFormData({ ...formData, rootstocks: val })}
                                            defaultValue=""
                                            renderInput={(val, _, onChange) => (
                                                <CreatableSelect
                                                    value={val}
                                                    onChange={onChange}
                                                    options={
                                                        formData.crop === 'Peer'
                                                            ? ["Kwee C", "Kwee Adams", "Q-Eline", "Kwee A", "Kwee MC"]
                                                            : ["M9", "M26", "G.11", "G.41"]
                                                    }
                                                    placeholder="Zoek of typ onderstam..."
                                                />
                                            )}
                                        />
                                        <WeightedInputGroup
                                            label="Tussenstam(men)"
                                            values={formData.interstocks || []}
                                            onChange={(val) => setFormData({ ...formData, interstocks: val })}
                                            defaultValue=""
                                            renderInput={(val, _, onChange) => (
                                                <CreatableSelect
                                                    value={val}
                                                    onChange={onChange}
                                                    options={[]}
                                                    placeholder="Typ tussenstam..."
                                                />
                                            )}
                                        />
                                        <WeightedInputGroup
                                            label="Plantjaar/jaren"
                                            values={formData.plantingYears || []}
                                            onChange={(val) => setFormData({ ...formData, plantingYears: val })}
                                            defaultValue={new Date().getFullYear()}
                                            renderInput={(val, _, onChange) => (
                                                <Select value={val.toString()} onValueChange={(v) => onChange(parseInt(v))}>
                                                    <SelectTrigger className="h-9 bg-black/40 border-white/10 text-white font-mono">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                        {Array.from({ length: 2026 - 1950 + 1 }, (_, i) => 2026 - i).map(y => (
                                                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        <WeightedInputGroup
                                            label="Plantafstand(en)"
                                            values={formData.plantingDistances || []}
                                            onChange={(val) => setFormData({ ...formData, plantingDistances: val })}
                                            defaultValue={{ row: 3, tree: 1 }}
                                            unit="Bomen/ha"
                                            renderInput={(val, _, onChange) => (
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <Label className="text-[8px] uppercase text-white/30 font-bold">Rijbreedte</Label>
                                                        <Input type="number" step="0.1" value={Number.isNaN(val.row) ? "" : val.row} onChange={(e) => onChange({ ...val, row: e.target.value === '' ? NaN : parseFloat(e.target.value) })} className="h-8 bg-black/40 border-white/10 font-mono text-xs" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[8px] uppercase text-white/30 font-bold">Boomafstand</Label>
                                                        <Input type="number" step="0.1" value={Number.isNaN(val.tree) ? "" : val.tree} onChange={(e) => onChange({ ...val, tree: e.target.value === '' ? NaN : parseFloat(e.target.value) })} className="h-8 bg-black/40 border-white/10 font-mono text-xs" />
                                                    </div>
                                                </div>
                                            )}
                                        />
                                        <div className="p-4 bg-primary/5 border-y border-primary/10">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Gem. Bomen per ha</span>
                                                <span className="text-lg font-black text-primary">{treesPerHa}</span>
                                            </div>
                                        </div>

                                        {/* Water Management Section */}
                                        <div className="p-4 space-y-4">
                                            <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Watermanagement</h4>

                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Irrigatie</Label>
                                                <div className="flex gap-2">
                                                    <Select value={formData.irrigationType} onValueChange={(v) => setFormData({ ...formData, irrigationType: v })}>
                                                        <SelectTrigger className="grow h-9 bg-black/40 border-white/10 text-white">
                                                            <SelectValue placeholder="Selecteer..." />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                            {["Ja met fertigatie", "Ja", "Nee", "Deels"].map(opt => (
                                                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {formData.irrigationType === 'Deels' && (
                                                        <div className="w-24 relative">
                                                            <Input
                                                                type="number"
                                                                value={Number.isNaN(formData.irrigationPercentage) ? '' : (formData.irrigationPercentage ?? '')}
                                                                onChange={(e) => setFormData({ ...formData, irrigationPercentage: e.target.value === '' ? NaN : parseInt(e.target.value) })}
                                                                className="h-9 bg-black/40 border-white/10 text-right pr-6"
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30">%</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Berekening (Nachtvorst)</Label>
                                                <div className="flex gap-2">
                                                    <Select value={formData.frostProtectionType || 'Nee'} onValueChange={(v) => setFormData({ ...formData, frostProtectionType: v })}>
                                                        <SelectTrigger className="grow h-9 bg-black/40 border-white/10 text-white">
                                                            <SelectValue placeholder="Selecteer..." />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                            {["Ja", "Nee", "Deels"].map(opt => (
                                                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {formData.frostProtectionType === 'Deels' && (
                                                        <div className="w-24 relative">
                                                            <Input
                                                                type="number"
                                                                value={Number.isNaN(formData.frostProtectionPercentage) ? '' : (formData.frostProtectionPercentage ?? '')}
                                                                onChange={(e) => setFormData({ ...formData, frostProtectionPercentage: e.target.value === '' ? NaN : parseInt(e.target.value) })}
                                                                className="h-9 bg-black/40 border-white/10 text-right pr-6"
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30">%</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <EditField label="Oppervlakte (ha)" field="area" type="number" />

                                        {/* Synonyms editor */}
                                        <div className="px-5 py-4 space-y-2">
                                            <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Synoniemen (alternatieve namen voor Slimme Invoer)</Label>
                                            <div className="flex flex-wrap gap-1.5">
                                                {synonyms.map((s, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/60">
                                                        {s}
                                                        <button onClick={() => {
                                                            const updated = synonyms.filter((_, idx) => idx !== i)
                                                            setSynonyms(updated)
                                                            updateParcelSynonyms(subParcel.id, updated).then(() => invalidateParcels())
                                                        }} className="hover:text-rose-400 transition-colors">
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                            <Input
                                                value={synonymInput}
                                                onChange={(e) => setSynonymInput(e.target.value)}
                                                placeholder="Typ synoniem en druk Enter..."
                                                className="h-8 text-sm bg-black/40 border-white/10"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && synonymInput.trim()) {
                                                        e.preventDefault()
                                                        const updated = [...synonyms, synonymInput.trim()]
                                                        setSynonyms(updated)
                                                        setSynonymInput('')
                                                        updateParcelSynonyms(subParcel.id, updated).then(() => invalidateParcels())
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Composition Summary in View Mode */}
                                        <div className="bg-black/20 pb-4">
                                            <CompositionBar label="Mutanten" values={formData.mutants} />
                                            <CompositionBar label="Onderstammen" values={formData.rootstocks} />
                                            <CompositionBar label="Tussenstammen" values={formData.interstocks} />
                                        </div>

                                        <DisplayField label="Bomen per ha (gem)" value={treesPerHa} highlight icon={TrendingUp} />
                                        <DisplayField label="Plantjaren" value={(formData.plantingYears || []).map(y => y.value).join(", ")} icon={Calendar} />
                                        <DisplayField
                                            label="Irrigatie"
                                            value={formData.irrigationType + (formData.irrigationType === 'Deels' ? ` (${formData.irrigationPercentage}%)` : '')}
                                            icon={CloudRain}
                                        />
                                        <DisplayField
                                            label="Berekening"
                                            value={(formData.frostProtectionType || 'Nee') + (formData.frostProtectionType === 'Deels' ? ` (${formData.frostProtectionPercentage}%)` : '')}
                                            icon={Thermometer}
                                        />
                                        <DisplayField label="Oppervlakte" value={`${formData.area.toFixed(2)} ha`} icon={MapIcon} />
                                        {synonyms.length > 0 && (
                                            <div className="px-5 py-3">
                                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Synoniemen</span>
                                                <p className="text-xs text-white/40 italic mt-0.5">{synonyms.join(', ')}</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Actions / Integration */}
                    <Card className="bg-primary/10 border-primary/20 border-dashed">
                        <CardContent className="p-6 text-center space-y-4">
                            <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
                                <FileText className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-black text-white text-sm">Nieuw Bodemmonster</h3>
                                <p className="text-[11px] text-white/50 mt-1">Upload een Eurofins PDF en laat de AI de waardes extraheren.</p>
                            </div>
                            <Button className="w-full bg-white text-black hover:bg-white/90 font-black rounded-full shadow-xl h-10">
                                Upload PDF
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Analytics & Trends */}
                <div className="lg:col-span-2 space-y-6">
                    <Tabs defaultValue="soil" className="w-full">
                        <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
                            <TabsTrigger value="soil" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                Bodemgezondheid
                            </TabsTrigger>
                            <TabsTrigger value="production" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                Productie Historie
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="soil" className="mt-6 space-y-6">
                            <Card className="bg-card/30 backdrop-blur-md border-white/5">
                                <CardHeader>
                                    <CardTitle className="text-lg font-black text-white flex items-center justify-between">
                                        <span>Organische Stof & pH Trend</span>
                                        <Badge variant="outline" className="border-white/10 text-white/40">Laatste 5 jaar</Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={soilTrendData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                            <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#121212', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                                itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                            />
                                            <Line type="monotone" dataKey="ph" stroke="#4ade80" strokeWidth={3} dot={{ fill: '#4ade80' }} />
                                            <Line type="monotone" dataKey="organicMatter" stroke="#fb923c" strokeWidth={3} dot={{ fill: '#fb923c' }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Individual Samples List */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {soilSamples.map((sample) => (
                                    <Card key={sample.id} className="bg-white/5 border-white/5 hover:bg-white/10 transition-colors group">
                                        <CardContent className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-emerald-500/20 rounded-lg group-hover:bg-emerald-500/30 transition-colors">
                                                    <Leaf className="h-4 w-4 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-white/90">{format(sample.sampleDate, 'dd MMMM yyyy', { locale: nl })}</p>
                                                    <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">Monster Rapport</p>
                                                </div>
                                            </div>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-lg font-black text-white">{sample.ph?.toFixed(1)}</span>
                                                <span className="text-[10px] font-bold text-white/30">pH</span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="production" className="mt-6 space-y-6">
                            <Card className="bg-card/30 backdrop-blur-md border-white/5">
                                <CardHeader>
                                    <CardTitle className="text-lg font-black text-white">Opbrengst per Hectare (Ton/Ha)</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={productionData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                            <XAxis dataKey="year" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#121212', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                            />
                                            <Bar dataKey="ratio" fill="url(#colorRatio)" radius={[4, 4, 0, 0]} />
                                            <defs>
                                                <linearGradient id="colorRatio" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                </linearGradient>
                                            </defs>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Table version for detail */}
                            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white/5 text-[10px] uppercase font-black tracking-widest text-white/40">
                                        <tr>
                                            <th className="px-6 py-3">Jaar</th>
                                            <th className="px-6 py-3">Tonnage (Totaal)</th>
                                            <th className="px-6 py-3">Rendement (Ton/Ha)</th>
                                            <th className="px-6 py-3 text-right">Maatvoering</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {productionData.map((p, i) => (
                                            <tr key={i} className="hover:bg-white/5">
                                                <td className="px-6 py-4 font-black text-white">{p.year}</td>
                                                <td className="px-6 py-4 font-mono font-bold text-white/80">{p.tonnage.toFixed(1)} ton</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-black text-primary">{p.ratio.toFixed(1)}</span>
                                                        <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full bg-primary" style={{ width: `${Math.min((p.ratio / 100) * 100, 100)}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Badge variant="outline" className="border-white/10 text-white/40">Bekijk Details</Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    )
}

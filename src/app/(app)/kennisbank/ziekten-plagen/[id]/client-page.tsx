'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Bug,
    Leaf,
    AlertTriangle,
    Calendar,
    Eye,
    Microscope,
    Shield,
    Swords,
    Snowflake,
    Droplets,
    Target,
    ChevronRight,
    ChevronLeft,
    ExternalLink,
    Sparkles,
    TreeDeciduous,
    Apple,
    Camera,
    FlaskConical
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

import { PestDisease, PestType, ImpactLevel, LifecycleEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

// Extended mock data for detail view
const mockPestDetail: PestDisease = {
    id: '1',
    name: 'Schurft',
    latinName: 'Venturia inaequalis',
    type: 'fungus',
    crop: 'apple',
    impactLevel: 'critical',
    subtitle: 'De nummer 1 vijand van de appelteler',
    heroImageUrl: '/placeholder-scab-hero.jpg',
    galleryImages: [
        { url: '/placeholder-scab-1.jpg', caption: 'Eerste schurftsporen op blad', stage: 'early' },
        { url: '/placeholder-scab-2.jpg', caption: 'Bladschurft volgroeid', stage: 'leaf' },
        { url: '/placeholder-scab-3.jpg', caption: 'Vruchtschurft - kurkvorming', stage: 'fruit' },
    ],
    overwintering: 'Overwintert in afgevallen bladeren op de grond als pseudothecia (vruchtlichamen). Het bladruimen in de herfst vermindert het inoculum significant. Bladvertering stimuleren met ureum (5%) na bladval.',
    infectionConditions: 'Heeft bladnat nodig (minimaal 9-12 uur) bij temperaturen boven 7°C. De RIM-tabel (Mills) is essentieel voor timing van bespuitingen. Bij 10°C zijn 14 uur bladnat nodig, bij 20°C slechts 6 uur.',
    damageThreshold: 'Preventieve aanpak vereist - bij eerste infectie direct ingrijpen. Eén zichtbare schurftplek op het blad = duizenden nieuwe sporen. Zero tolerance beleid voor exportpartijen.',
    biologicalControl: 'Natuurlijke antagonisten zoals Cladosporium cladosporioides kunnen schurftsporen onderdrukken. Stimuleer bladvertering met compostthee. Bladvoeders met kaliumfosfaat kunnen weerstand verhogen.',
    culturalControl: 'Bladruimen of versnipperen na bladval. Snoeihout verwijderen. Open boomstructuur voor snelle bladopdroging. Gevoelige rassen (Elstar, Jonagold) vragen extra aandacht.',
    chemicalControl: 'Preventief: Captan, Mancozeb, Metiram. Curatief: Score, Chorus (max 3-4x per seizoen vanwege resistentie). Stroby alleen als eradicant bij hoge druk.',
    lifecycleTimeline: [
        { month: 3, activity: 'Ascosporen rijpen in pseudothecia', intensity: 30 },
        { month: 4, activity: 'Primaire infecties bij bladnat', intensity: 80 },
        { month: 5, activity: 'Secundaire infecties - snelle verspreiding', intensity: 100 },
        { month: 6, activity: 'Verspreiding naar vruchten', intensity: 70 },
        { month: 7, activity: 'Zomerinfecties mogelijk', intensity: 50 },
        { month: 8, activity: 'Bewaarschurft risico', intensity: 40 },
        { month: 9, activity: 'Late infecties - lenticellen', intensity: 30 },
        { month: 10, activity: 'Bladval - pseudothecia vorming', intensity: 20 },
    ],
    symptoms: [
        { stage: 'early', description: 'Lichtgroene tot olijfkleurige vlekken op jonge bladeren, vaak bij de nerven. Fluweelachtige textuur door sporenvorming.' },
        { stage: 'developing', description: 'Vlekken worden donkerder en groter. Bladvervorming kan optreden. Secundaire infecties zichtbaar op nieuwe scheuten.' },
        { stage: 'advanced', description: 'Op vruchten: bruine kurkachtige plekken, vaak met scheuren. Kan leiden tot vroegtijdige vruchtval of misvormde vruchten. Bewaarschurft toont zich pas maanden later.' },
    ],
    tags: ['schurft', 'appel', 'schimmel', 'primair', 'fungicide'],
    searchKeywords: ['schurft', 'venturia', 'inaequalis', 'apple scab', 'appelschurft'],
    relatedProducts: ['captan-80-wdg', 'score-250-ec', 'delan-wg'],
    externalLinks: [
        { title: 'RIMpro Schurftmodel', url: 'https://rimpro.eu', source: 'RIMpro' },
        { title: 'WUR Schurftbeheersing', url: 'https://wur.nl/schurft', source: 'Wageningen' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const monthNames = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

const typeLabels: Record<PestType, string> = {
    fungus: 'Schimmel',
    insect: 'Insect',
    bacteria: 'Bacterie',
    virus: 'Virus',
    mite: 'Mijt',
    other: 'Overig'
};

const impactColors: Record<ImpactLevel, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-green-500'
};

const impactLabels: Record<ImpactLevel, string> = {
    critical: 'Kritiek',
    high: 'Hoog',
    medium: 'Gemiddeld',
    low: 'Laag'
};

const impactDescriptions: Record<ImpactLevel, string> = {
    critical: 'Kan de volledige oogst vernietigen bij niet-ingrijpen',
    high: 'Significante opbrengstderving mogelijk',
    medium: 'Beheersbaar met goede timing',
    low: 'Beperkte economische impact'
};

interface PestDetailClientProps {
    id: string;
}

function LifecycleTimeline({ timeline }: { timeline: LifecycleEntry[] }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider px-1">
                {monthNames.map((month, i) => (
                    <span key={month} className="w-8 text-center">{month}</span>
                ))}
            </div>

            {/* Timeline bars */}
            <div className="relative h-12 bg-muted/20 rounded-lg overflow-hidden">
                {timeline.map((entry, i) => {
                    const left = ((entry.month - 1) / 12) * 100;
                    const width = (1 / 12) * 100;
                    const height = (entry.intensity / 100) * 100;

                    return (
                        <div
                            key={i}
                            className="absolute bottom-0 transition-all group cursor-pointer"
                            style={{ left: `${left}%`, width: `${width}%` }}
                        >
                            <div
                                className={cn(
                                    "mx-0.5 rounded-t-sm transition-all",
                                    entry.intensity > 70 ? "bg-emerald-500 hover:bg-emerald-400" :
                                        entry.intensity > 30 ? "bg-emerald-500/60 hover:bg-emerald-500" :
                                            "bg-emerald-500/30 hover:bg-emerald-500/50"
                                )}
                                style={{ height: `${height}%` }}
                            />

                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                <p className="font-semibold">{monthNames[entry.month - 1]}</p>
                                <p className="text-muted-foreground">{entry.activity}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend with activities */}
            <div className="flex flex-wrap gap-2 mt-4">
                {timeline.filter(e => e.intensity > 50).map((entry, i) => (
                    <Badge
                        key={i}
                        variant="outline"
                        className="bg-emerald-500/10 border-emerald-500/20 text-xs"
                    >
                        {monthNames[entry.month - 1]}: {entry.activity}
                    </Badge>
                ))}
            </div>
        </div>
    );
}

function GalleryCarousel({ images }: { images: typeof mockPestDetail.galleryImages }) {
    const [currentIndex, setCurrentIndex] = React.useState(0);

    if (images.length === 0) {
        return (
            <div className="aspect-video bg-muted/20 rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                    <Camera className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nog geen afbeeldingen</p>
                </div>
            </div>
        );
    }

    const stageLabels = {
        early: 'Beginstadium',
        leaf: 'Bladschade',
        fruit: 'Vruchtschade',
        other: 'Overig'
    };

    return (
        <div className="space-y-4">
            {/* Main Image */}
            <div className="relative aspect-video bg-muted/20 rounded-lg overflow-hidden group">
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${images[currentIndex].url})` }}
                />

                {/* Stage badge */}
                {images[currentIndex].stage && (
                    <div className="absolute top-3 left-3">
                        <Badge className="bg-black/60 text-white border-0">
                            {stageLabels[images[currentIndex].stage!]}
                        </Badge>
                    </div>
                )}

                {/* Navigation */}
                {images.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setCurrentIndex(i => i === 0 ? images.length - 1 : i - 1)}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setCurrentIndex(i => i === images.length - 1 ? 0 : i + 1)}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </>
                )}

                {/* Caption */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <p className="text-white text-sm">{images[currentIndex].caption}</p>
                </div>
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
                <div className="flex gap-2">
                    {images.map((img, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrentIndex(i)}
                            className={cn(
                                "flex-1 aspect-video rounded-md overflow-hidden border-2 transition-all",
                                i === currentIndex
                                    ? "border-emerald-500"
                                    : "border-transparent opacity-60 hover:opacity-100"
                            )}
                        >
                            <div
                                className="w-full h-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${img.url})` }}
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function PestDetailClient({ id }: PestDetailClientProps) {
    const router = useRouter();
    const pest = mockPestDetail; // In real app: fetch by id

    return (
        <div className="min-h-screen">
            {/* Hero Header */}
            <div className="relative h-64 bg-gradient-to-br from-emerald-900/50 to-emerald-950/80 overflow-hidden">
                {pest.heroImageUrl && (
                    <div
                        className="absolute inset-0 bg-cover bg-center opacity-30"
                        style={{ backgroundImage: `url(${pest.heroImageUrl})` }}
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />

                {/* Back button */}
                <div className="absolute top-6 left-6">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/kennisbank')}
                        className="bg-black/30 hover:bg-black/50 text-white"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </div>

                {/* Identity Card - Positioned at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex items-end justify-between">
                        <div>
                            {/* Type & Crop badges */}
                            <div className="flex items-center gap-2 mb-3">
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                    {pest.type === 'fungus' ? <Leaf className="h-3 w-3 mr-1" /> : <Bug className="h-3 w-3 mr-1" />}
                                    {typeLabels[pest.type]}
                                </Badge>
                                {(pest.crop === 'apple' || pest.crop === 'both') && (
                                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                        <Apple className="h-3 w-3 mr-1" />
                                        Appel
                                    </Badge>
                                )}
                                {(pest.crop === 'pear' || pest.crop === 'both') && (
                                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                        <TreeDeciduous className="h-3 w-3 mr-1" />
                                        Peer
                                    </Badge>
                                )}
                            </div>

                            {/* Name */}
                            <h1 className="text-4xl font-bold text-white mb-1">{pest.name}</h1>

                            {/* Latin name */}
                            {pest.latinName && (
                                <p className="text-lg text-white/70 italic">{pest.latinName}</p>
                            )}

                            {/* Subtitle */}
                            {pest.subtitle && (
                                <p className="text-white/80 mt-2 text-lg">{pest.subtitle}</p>
                            )}
                        </div>

                        {/* Impact indicator */}
                        <div className="text-right">
                            <p className="text-xs text-white/60 uppercase tracking-wider mb-1">Impact op opbrengst</p>
                            <div className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-white font-bold",
                                impactColors[pest.impactLevel]
                            )}>
                                <AlertTriangle className="h-4 w-4" />
                                {impactLabels[pest.impactLevel]}
                            </div>
                            <p className="text-xs text-white/60 mt-1 max-w-[200px]">
                                {impactDescriptions[pest.impactLevel]}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6 space-y-8 max-w-7xl mx-auto">

                {/* Lifecycle Timeline Section */}
                <Card className="border-emerald-500/20 bg-card/50">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-emerald-400">
                            <Calendar className="h-5 w-5" />
                            Levenslijn - Wanneer is deze actief?
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <LifecycleTimeline timeline={pest.lifecycleTimeline} />
                    </CardContent>
                </Card>

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Left Column: Gallery & Recognition */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Gallery */}
                        <Card className="border-emerald-500/20 bg-card/50">
                            <CardHeader className="pb-4">
                                <CardTitle className="flex items-center gap-2 text-emerald-400">
                                    <Eye className="h-5 w-5" />
                                    Herkenning
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <GalleryCarousel images={pest.galleryImages} />
                            </CardContent>
                        </Card>

                        {/* Symptoms */}
                        <Card className="border-emerald-500/20 bg-card/50">
                            <CardHeader className="pb-4">
                                <CardTitle className="flex items-center gap-2 text-emerald-400">
                                    <Microscope className="h-5 w-5" />
                                    Symptomen per Stadium
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {pest.symptoms.map((symptom, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "p-4 rounded-lg border-l-4",
                                            symptom.stage === 'early' && "bg-yellow-500/5 border-yellow-500",
                                            symptom.stage === 'developing' && "bg-orange-500/5 border-orange-500",
                                            symptom.stage === 'advanced' && "bg-red-500/5 border-red-500"
                                        )}
                                    >
                                        <p className="text-xs font-bold uppercase tracking-wider mb-1 text-muted-foreground">
                                            {symptom.stage === 'early' && 'Beginstadium'}
                                            {symptom.stage === 'developing' && 'Ontwikkeling'}
                                            {symptom.stage === 'advanced' && 'Gevorderd'}
                                        </p>
                                        <p className="text-sm">{symptom.description}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Biology & Strategy */}
                    <div className="space-y-6">

                        {/* Biology Card */}
                        <Card className="border-emerald-500/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center gap-2 text-emerald-400">
                                    <FlaskConical className="h-4 w-4" />
                                    Biologie & Condities
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {pest.overwintering && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Snowflake className="h-4 w-4 text-blue-400" />
                                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Overwintering</p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{pest.overwintering}</p>
                                    </div>
                                )}

                                {pest.infectionConditions && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Droplets className="h-4 w-4 text-cyan-400" />
                                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Infectie-eisen</p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{pest.infectionConditions}</p>
                                    </div>
                                )}

                                {pest.damageThreshold && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Target className="h-4 w-4 text-red-400" />
                                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Schadedrempel</p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{pest.damageThreshold}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Strategy Card */}
                        <Card className="border-emerald-500/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center gap-2 text-emerald-400">
                                    <Swords className="h-4 w-4" />
                                    Bestrijdingsstrategie
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="biological" className="w-full">
                                    <TabsList className="w-full grid grid-cols-3 bg-emerald-900/10">
                                        <TabsTrigger value="biological" className="text-xs data-[state=active]:bg-emerald-600">Bio</TabsTrigger>
                                        <TabsTrigger value="cultural" className="text-xs data-[state=active]:bg-emerald-600">Teelt</TabsTrigger>
                                        <TabsTrigger value="chemical" className="text-xs data-[state=active]:bg-emerald-600">Chemisch</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="biological" className="mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {pest.biologicalControl || 'Geen biologische bestrijdingsinfo beschikbaar.'}
                                        </p>
                                    </TabsContent>

                                    <TabsContent value="cultural" className="mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {pest.culturalControl || 'Geen teeltmaatregelen beschikbaar.'}
                                        </p>
                                    </TabsContent>

                                    <TabsContent value="chemical" className="mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {pest.chemicalControl || 'Geen chemische bestrijdingsinfo beschikbaar.'}
                                        </p>

                                        {pest.relatedProducts.length > 0 && (
                                            <Button
                                                variant="outline"
                                                className="w-full mt-4 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                                onClick={() => router.push('/gewasbescherming?filter=' + pest.name)}
                                            >
                                                <Shield className="h-4 w-4 mr-2" />
                                                Toon Toegelaten Middelen
                                            </Button>
                                        )}
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>

                        {/* External Links */}
                        {pest.externalLinks.length > 0 && (
                            <Card className="border-emerald-500/20 bg-card/50">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base flex items-center gap-2 text-emerald-400">
                                        <ExternalLink className="h-4 w-4" />
                                        Externe Bronnen
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {pest.externalLinks.map((link, i) => (
                                        <a
                                            key={i}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-emerald-500/10 transition-colors group"
                                        >
                                            <div>
                                                <p className="text-sm font-medium group-hover:text-emerald-400 transition-colors">
                                                    {link.title}
                                                </p>
                                                {link.source && (
                                                    <p className="text-xs text-muted-foreground">{link.source}</p>
                                                )}
                                            </div>
                                            <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-emerald-400" />
                                        </a>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Tags */}
                        <Card className="border-emerald-500/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base text-emerald-400">Tags</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2">
                                    {pest.tags.map(tag => (
                                        <Badge
                                            key={tag}
                                            variant="secondary"
                                            className="bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer"
                                        >
                                            #{tag}
                                        </Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}

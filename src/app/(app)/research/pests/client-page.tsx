'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Bug,
    Leaf,
    Search,
    Filter,
    ArrowLeft,
    AlertTriangle,
    TreeDeciduous,
    Apple
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { PestDisease, PestType, CropType, ImpactLevel } from '@/lib/types';
import { cn } from '@/lib/utils';

// Mock data matching our SQL structure
const mockPests: PestDisease[] = [
    {
        id: '1',
        name: 'Schurft',
        latinName: 'Venturia inaequalis',
        type: 'fungus',
        crop: 'apple',
        impactLevel: 'critical',
        subtitle: 'De nummer 1 vijand van de appelteler',
        heroImageUrl: '/placeholder-scab.jpg',
        galleryImages: [],
        lifecycleTimeline: [
            { month: 3, activity: 'Ascosporenrijping', intensity: 30 },
            { month: 4, activity: 'Primaire infecties', intensity: 80 },
            { month: 5, activity: 'Secundaire infecties', intensity: 100 },
        ],
        symptoms: [],
        tags: ['schurft', 'appel', 'schimmel'],
        searchKeywords: ['schurft', 'venturia', 'scab'],
        relatedProducts: [],
        externalLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '2',
        name: 'Fruitmot',
        latinName: 'Cydia pomonella',
        type: 'insect',
        crop: 'both',
        impactLevel: 'critical',
        subtitle: 'De worm in de appel - wormstekigheid',
        heroImageUrl: '/placeholder-moth.jpg',
        galleryImages: [],
        lifecycleTimeline: [
            { month: 5, activity: '1e vlucht start', intensity: 50 },
            { month: 6, activity: 'Piek 1e generatie', intensity: 100 },
        ],
        symptoms: [],
        tags: ['fruitmot', 'insect', 'mot'],
        searchKeywords: ['fruitmot', 'cydia', 'codling moth'],
        relatedProducts: [],
        externalLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '3',
        name: 'Perenbladvlo',
        latinName: 'Cacopsylla pyri',
        type: 'insect',
        crop: 'pear',
        impactLevel: 'critical',
        subtitle: 'Honingdauw en roetdauw',
        heroImageUrl: '/placeholder-psylla.jpg',
        galleryImages: [],
        lifecycleTimeline: [
            { month: 4, activity: '1e generatie', intensity: 70 },
            { month: 6, activity: 'Explosieve groei', intensity: 100 },
        ],
        symptoms: [],
        tags: ['bladvlo', 'peer', 'insect'],
        searchKeywords: ['perenbladvlo', 'cacopsylla', 'psylla'],
        relatedProducts: [],
        externalLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '4',
        name: 'Meeldauw',
        latinName: 'Podosphaera leucotricha',
        type: 'fungus',
        crop: 'apple',
        impactLevel: 'high',
        subtitle: 'De witte waas op jonge scheuten',
        heroImageUrl: '/placeholder-mildew.jpg',
        galleryImages: [],
        lifecycleTimeline: [],
        symptoms: [],
        tags: ['meeldauw', 'appel', 'schimmel'],
        searchKeywords: ['meeldauw', 'podosphaera', 'mildew'],
        relatedProducts: [],
        externalLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '5',
        name: 'Stemphylium',
        latinName: 'Stemphylium vesicarium',
        type: 'fungus',
        crop: 'pear',
        impactLevel: 'critical',
        subtitle: 'De moderne plaag - bruinrot',
        heroImageUrl: '/placeholder-stemphylium.jpg',
        galleryImages: [],
        lifecycleTimeline: [],
        symptoms: [],
        tags: ['stemphylium', 'peer', 'schimmel'],
        searchKeywords: ['stemphylium', 'brown spot'],
        relatedProducts: [],
        externalLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '6',
        name: 'Vruchtboomkanker',
        latinName: 'Nectria galligena',
        type: 'fungus',
        crop: 'both',
        impactLevel: 'high',
        subtitle: 'Houtaantasting met blijvende schade',
        heroImageUrl: '/placeholder-canker.jpg',
        galleryImages: [],
        lifecycleTimeline: [],
        symptoms: [],
        tags: ['kanker', 'schimmel', 'hout'],
        searchKeywords: ['vruchtboomkanker', 'nectria', 'canker'],
        relatedProducts: [],
        externalLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '7',
        name: 'Appelbloedluis',
        latinName: 'Eriosoma lanigerum',
        type: 'insect',
        crop: 'apple',
        impactLevel: 'high',
        subtitle: 'Wollige witte plekken op het hout',
        heroImageUrl: '/placeholder-woolly.jpg',
        galleryImages: [],
        lifecycleTimeline: [],
        symptoms: [],
        tags: ['bloedluis', 'appel', 'insect'],
        searchKeywords: ['appelbloedluis', 'eriosoma', 'woolly aphid'],
        relatedProducts: [],
        externalLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '8',
        name: 'Spintmijt',
        latinName: 'Panonychus ulmi',
        type: 'mite',
        crop: 'both',
        impactLevel: 'medium',
        subtitle: 'Bronzen bladeren - zuigschade',
        heroImageUrl: '/placeholder-mite.jpg',
        galleryImages: [],
        lifecycleTimeline: [],
        symptoms: [],
        tags: ['spint', 'mijt'],
        searchKeywords: ['spintmijt', 'panonychus', 'spider mite'],
        relatedProducts: [],
        externalLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

const typeLabels: Record<PestType, string> = {
    fungus: 'Schimmel',
    insect: 'Insect',
    bacteria: 'Bacterie',
    virus: 'Virus',
    mite: 'Mijt',
    other: 'Overig'
};

const typeIcons: Record<PestType, React.ReactNode> = {
    fungus: <Leaf className="h-3.5 w-3.5" />,
    insect: <Bug className="h-3.5 w-3.5" />,
    bacteria: <AlertTriangle className="h-3.5 w-3.5" />,
    virus: <AlertTriangle className="h-3.5 w-3.5" />,
    mite: <Bug className="h-3.5 w-3.5" />,
    other: <AlertTriangle className="h-3.5 w-3.5" />
};

const cropLabels: Record<CropType, string> = {
    apple: 'Appel',
    pear: 'Peer',
    both: 'Appel & Peer'
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

function PestCard({ pest }: { pest: PestDisease }) {
    const router = useRouter();

    return (
        <Card
            className="group bg-card/50 border-emerald-500/10 hover:border-emerald-500/30 hover:bg-emerald-900/10 transition-all cursor-pointer overflow-hidden"
            onClick={() => router.push(`/research/pests/${pest.id}`)}
        >
            {/* Hero Image Placeholder */}
            <div className="h-32 bg-gradient-to-br from-emerald-900/30 to-emerald-950/50 relative overflow-hidden">
                {pest.heroImageUrl ? (
                    <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url(${pest.heroImageUrl})` }} />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        {pest.type === 'fungus' ? (
                            <Leaf className="h-12 w-12 text-emerald-500/20" />
                        ) : (
                            <Bug className="h-12 w-12 text-emerald-500/20" />
                        )}
                    </div>
                )}

                {/* Impact Badge */}
                <div className="absolute top-3 right-3">
                    <div className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white",
                        impactColors[pest.impactLevel]
                    )}>
                        {impactLabels[pest.impactLevel]}
                    </div>
                </div>

                {/* Crop Badge */}
                <div className="absolute top-3 left-3 flex gap-1">
                    {(pest.crop === 'apple' || pest.crop === 'both') && (
                        <div className="bg-red-500/80 p-1 rounded-full">
                            <Apple className="h-3 w-3 text-white" />
                        </div>
                    )}
                    {(pest.crop === 'pear' || pest.crop === 'both') && (
                        <div className="bg-green-600/80 p-1 rounded-full">
                            <TreeDeciduous className="h-3 w-3 text-white" />
                        </div>
                    )}
                </div>
            </div>

            <CardContent className="p-4">
                {/* Type Badge */}
                <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] gap-1">
                        {typeIcons[pest.type]}
                        {typeLabels[pest.type]}
                    </Badge>
                </div>

                {/* Name */}
                <h3 className="font-bold text-lg text-foreground group-hover:text-emerald-400 transition-colors">
                    {pest.name}
                </h3>

                {/* Latin Name */}
                {pest.latinName && (
                    <p className="text-xs text-muted-foreground italic mb-2">
                        {pest.latinName}
                    </p>
                )}

                {/* Subtitle */}
                {pest.subtitle && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                        {pest.subtitle}
                    </p>
                )}

                {/* Quick Timeline Preview */}
                {pest.lifecycleTimeline.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-emerald-500/10">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Actieve maanden</p>
                        <div className="flex gap-0.5">
                            {Array.from({ length: 12 }, (_, i) => {
                                const entry = pest.lifecycleTimeline.find(e => e.month === i + 1);
                                const intensity = entry?.intensity || 0;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "flex-1 h-2 rounded-sm transition-all",
                                            intensity > 70 ? "bg-emerald-500" :
                                                intensity > 30 ? "bg-emerald-500/50" :
                                                    intensity > 0 ? "bg-emerald-500/20" :
                                                        "bg-muted/30"
                                        )}
                                        title={`${['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'][i]}: ${entry?.activity || 'Inactief'}`}
                                    />
                                );
                            })}
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[8px] text-muted-foreground">Jan</span>
                            <span className="text-[8px] text-muted-foreground">Dec</span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function PestsOverviewClient() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [cropFilter, setCropFilter] = React.useState<string>('all');
    const [typeFilter, setTypeFilter] = React.useState<string>('all');

    // Filter pests
    const filteredPests = React.useMemo(() => {
        return mockPests.filter(pest => {
            // Search filter
            const matchesSearch = searchQuery === '' ||
                pest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pest.latinName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pest.subtitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pest.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

            // Crop filter
            const matchesCrop = cropFilter === 'all' ||
                pest.crop === cropFilter ||
                pest.crop === 'both';

            // Type filter
            const matchesType = typeFilter === 'all' || pest.type === typeFilter;

            return matchesSearch && matchesCrop && matchesType;
        });
    }, [searchQuery, cropFilter, typeFilter]);

    // Group by type for tabs
    const fungi = filteredPests.filter(p => p.type === 'fungus');
    const insects = filteredPests.filter(p => p.type === 'insect' || p.type === 'mite');

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/research')}
                    className="shrink-0"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <Bug className="h-6 w-6 text-emerald-500" />
                        </div>
                        Ziekten & Plagen
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Encyclopedie voor appel- en perenteelt
                    </p>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 bg-red-500/20 rounded-lg">
                            <Apple className="h-5 w-5 text-red-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-red-400">
                                {mockPests.filter(p => p.crop === 'apple' || p.crop === 'both').length}
                            </p>
                            <p className="text-xs text-muted-foreground">Appel ziekten</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-green-500/10 border-green-500/20">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                            <TreeDeciduous className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-green-400">
                                {mockPests.filter(p => p.crop === 'pear' || p.crop === 'both').length}
                            </p>
                            <p className="text-xs text-muted-foreground">Peer ziekten</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-emerald-500/10 border-emerald-500/20">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                            <Leaf className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-emerald-400">
                                {mockPests.filter(p => p.type === 'fungus').length}
                            </p>
                            <p className="text-xs text-muted-foreground">Schimmels</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-orange-500/10 border-orange-500/20">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 bg-orange-500/20 rounded-lg">
                            <Bug className="h-5 w-5 text-orange-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-orange-400">
                                {mockPests.filter(p => p.type === 'insect' || p.type === 'mite').length}
                            </p>
                            <p className="text-xs text-muted-foreground">Insecten & Mijten</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center bg-card/50 p-4 rounded-lg border border-emerald-500/10">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Zoek op naam, Latijnse naam of symptomen..."
                        className="pl-9 bg-background/50"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Select value={cropFilter} onValueChange={setCropFilter}>
                        <SelectTrigger className="w-[140px] bg-background/50">
                            <SelectValue placeholder="Gewas" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alle gewassen</SelectItem>
                            <SelectItem value="apple">Appel</SelectItem>
                            <SelectItem value="pear">Peer</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[140px] bg-background/50">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alle types</SelectItem>
                            <SelectItem value="fungus">Schimmel</SelectItem>
                            <SelectItem value="insect">Insect</SelectItem>
                            <SelectItem value="mite">Mijt</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Tabs: Schimmels / Insecten */}
            <Tabs defaultValue="all" className="w-full">
                <TabsList className="bg-emerald-900/10 border border-emerald-500/20 p-1">
                    <TabsTrigger
                        value="all"
                        className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-medium"
                    >
                        Alles ({filteredPests.length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="fungi"
                        className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-medium"
                    >
                        <Leaf className="h-4 w-4 mr-2" />
                        Schimmels ({fungi.length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="insects"
                        className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-medium"
                    >
                        <Bug className="h-4 w-4 mr-2" />
                        Insecten ({insects.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="mt-6">
                    {filteredPests.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredPests.map(pest => (
                                <PestCard key={pest.id} pest={pest} />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <Bug className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p>Geen resultaten gevonden</p>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="fungi" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {fungi.map(pest => (
                            <PestCard key={pest.id} pest={pest} />
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="insects" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {insects.map(pest => (
                            <PestCard key={pest.id} pest={pest} />
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

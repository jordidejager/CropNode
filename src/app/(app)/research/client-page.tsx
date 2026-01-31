'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import * as React from 'react';
import {
    BookOpen,
    Microscope,
    FileText,
    Plus,
    Search,
    Filter,
    MoreVertical,
    ExternalLink,
    Calendar,
    Tag,
    Activity, // Signal icon
    Sprout,
    Bug,
    ChevronRight
} from 'lucide-react';
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    getFilteredRowModel,
    ColumnDef
} from '@tanstack/react-table';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ResearchPaper, ResearchCategory, ResearchVerdict, FieldSignal } from '@/lib/types';
import { cn } from '@/lib/utils';
import { UploadModal } from '@/components/domain/research/upload-modal';
import { CreateSignalForm } from '@/components/domain/research/signals/create-signal-form';
import { SignalCard } from '@/components/domain/research/signals/signal-card';
import { getFieldSignalsAction } from '@/app/actions';

const mockData: ResearchPaper[] = [
    // ... existing mock data kept for context ...
    {
        id: '1',
        title: 'Optimale stikstofgift bij Elstar in kleigrond',
        category: 'cultivation',
        verdict: 'practical',
        createdAt: new Date('2024-03-01'),
        tags: ['Elstar', 'Stikstof', 'WUR'],
        summaryAi: 'Dit onderzoek toont aan dat een gefaseerde stikstofgift de vruchtkwaliteit verbetert.'
    },
    {
        id: '2',
        title: 'Beheersing van vruchtboomkanker (Neonectria ditissima)',
        category: 'disease',
        verdict: 'experimental',
        createdAt: new Date('2024-03-10'),
        tags: ['Kanker', 'Plantgezondheid', 'Appel'],
        summaryAi: 'Nieuwe fungiciden tonen veelbelovende resultaten in vroege veldproeven.'
    },
    {
        id: '3',
        title: 'Lange-termijn bewaring onder ULO condities',
        category: 'storage',
        verdict: 'theoretical',
        createdAt: new Date('2024-02-15'),
        tags: ['Bewaring', 'ULO', 'Koeling'],
        summaryAi: 'Theoretische analyse van energieverbruik bij verschillende koeltechnieken.'
    }
];

const categoryLabels: Record<ResearchCategory, string> = {
    disease: 'Ziekte & Plagen',
    storage: 'Bewaring',
    cultivation: 'Teelt & Optimalisatie',
    general: 'Algemeen'
};

const verdictColors: Record<ResearchVerdict, string> = {
    practical: 'bg-emerald-500',
    experimental: 'bg-amber-500',
    theoretical: 'bg-blue-500'
};

const verdictLabels: Record<ResearchVerdict, string> = {
    practical: 'Praktisch',
    experimental: 'Experimenteel',
    theoretical: 'Theoretisch'
};

const TEMP_USER_ID = "11111111-1111-1111-1111-111111111111"; // Placeholder until Auth is fully linked

export function ResearchDashboardClient() {
    const [data] = React.useState<ResearchPaper[]>(mockData);
    const [globalFilter, setGlobalFilter] = React.useState('');
    const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
    const [isUploadOpen, setIsUploadOpen] = React.useState(false);

    // Signals State
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialTab = searchParams.get('tab') || 'signals';
    const [activeTab, setActiveTab] = React.useState(initialTab);
    const [signals, setSignals] = React.useState<FieldSignal[]>([]);
    const [isLoadingSignals, setIsLoadingSignals] = React.useState(false);

    const fetchSignals = async () => {
        setIsLoadingSignals(true);
        try {
            const result = await getFieldSignalsAction(TEMP_USER_ID);
            setSignals(result);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingSignals(false);
        }
    };

    React.useEffect(() => {
        if (activeTab === 'signals') {
            fetchSignals();
        }
        // Update URL when tab changes
        const currentTab = searchParams.get('tab');
        if (currentTab !== activeTab) {
            router.replace(`/research?tab=${activeTab}`);
        }
    }, [activeTab, searchParams, router]);

    // Listen to URL changes
    React.useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && tab !== activeTab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    const columns = React.useMemo<ColumnDef<ResearchPaper>[]>(() => [
        {
            accessorKey: 'title',
            header: 'Titel',
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{row.original.title}</span>
                    <div className="flex gap-1 mt-1">
                        {row.original.tags.map(tag => (
                            <span key={tag} className="text-[10px] text-muted-foreground bg-secondary px-1 rounded">
                                #{tag}
                            </span>
                        ))}
                    </div>
                </div>
            )
        },
        {
            accessorKey: 'category',
            header: 'Categorie',
            cell: ({ row }) => (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    {categoryLabels[row.original.category]}
                </Badge>
            )
        },
        {
            accessorKey: 'createdAt',
            header: 'Datum',
            cell: ({ row }) => (
                <span className="text-muted-foreground text-sm">
                    {row.original.createdAt.toLocaleDateString('nl-NL')}
                </span>
            )
        },
        {
            accessorKey: 'verdict',
            header: 'Verdict',
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <div className={cn("h-2 w-2 rounded-full", verdictColors[row.original.verdict])} />
                    <span className="text-sm">{verdictLabels[row.original.verdict]}</span>
                </div>
            )
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => window.open(`/research/${row.original.id}`, '_self')}>
                            <ExternalLink className="mr-2 h-4 w-4" /> Bekijken
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <FileText className="mr-2 h-4 w-4" /> PDF Openen
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    ], []);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            globalFilter,
        },
        onGlobalFilterChange: setGlobalFilter,
    });

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <BookOpen className="h-8 w-8 text-emerald-500" />
                        Research Hub
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Centrale kennisbank en Field Signals voor het team.
                    </p>
                </div>
                {activeTab === 'papers' && (
                    <Button
                        onClick={() => setIsUploadOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Nieuw Onderzoek
                    </Button>
                )}
            </div>

            {/* Quick Navigation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Link href="/research/pests">
                    <Card className="bg-gradient-to-br from-emerald-900/20 to-emerald-950/30 border-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer group">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/20 rounded-lg group-hover:bg-emerald-500/30 transition-colors">
                                    <Bug className="h-5 w-5 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">Ziekten & Plagen</p>
                                    <p className="text-xs text-muted-foreground">Encyclopedie appel & peer</p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-emerald-900/10 border border-emerald-500/20 p-1 mb-8">
                    <TabsTrigger
                        value="papers"
                        className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-medium"
                    >
                        <FileText className="h-4 w-4 mr-2" />
                        Papers & Onderzoek
                    </TabsTrigger>
                    <TabsTrigger
                        value="signals"
                        className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-medium"
                    >
                        <Activity className="h-4 w-4 mr-2" />
                        Field Signals
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="papers" className="space-y-8 mt-0">
                    {/* Stat Cards Papers */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-emerald-900/10 border-emerald-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    Nieuw deze maand
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">12 Papers</div>
                                <p className="text-xs text-muted-foreground">+20% t.o.v. vorige maand</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-emerald-900/10 border-emerald-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                                    <Microscope className="h-4 w-4" />
                                    Totaal Onderzoek
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">458</div>
                                <p className="text-xs text-muted-foreground">WUR & PPO archief</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-emerald-900/10 border-emerald-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                                    <Tag className="h-4 w-4" />
                                    Top Categorie
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">Ziekte & Plagen</div>
                                <p className="text-xs text-muted-foreground">32% van alle publicaties</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Filter Bar */}
                    <div className="flex flex-col sm:flex-row gap-4 items-center bg-card/50 p-4 rounded-lg border border-emerald-500/10">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Zoek in onderzoek..."
                                className="pl-9 bg-background/50"
                                value={globalFilter}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-[180px] bg-background/50">
                                    <SelectValue placeholder="Categorie" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Alle Categorieën</SelectItem>
                                    <SelectItem value="disease">Ziekte & Plagen</SelectItem>
                                    <SelectItem value="storage">Bewaring</SelectItem>
                                    <SelectItem value="cultivation">Teelt</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" className="shrink-0">
                                <Filter className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Table Section */}
                    <Card className="border-emerald-500/10 bg-card/30 overflow-hidden">
                        {data.length > 0 ? (
                            <div className="rounded-md">
                                <Table>
                                    <TableHeader className="bg-emerald-900/20">
                                        {table.getHeaderGroups().map((headerGroup) => (
                                            <TableRow key={headerGroup.id}>
                                                {headerGroup.headers.map((header) => (
                                                    <TableHead key={header.id} className="text-emerald-400/80">
                                                        {flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableHeader>
                                    <TableBody>
                                        {table.getRowModel().rows.map((row) => (
                                            <TableRow
                                                key={row.id}
                                                className="hover:bg-emerald-500/5 cursor-pointer"
                                                onClick={() => window.open(`/research/${row.original.id}`, '_self')}
                                            >
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell key={cell.id}>
                                                        {flexRender(
                                                            cell.column.columnDef.cell,
                                                            cell.getContext()
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="p-20 flex flex-col items-center justify-center text-center">
                                {/* Empty state content kept simplified for brevity */}
                                <BookOpen className="h-12 w-12 text-emerald-500/50 mb-4" />
                                <h3 className="text-xl font-semibold mb-2">Geen onderzoek gevonden</h3>
                                <Button
                                    onClick={() => setIsUploadOpen(true)}
                                    className="mt-6 bg-emerald-600 hover:bg-emerald-500"
                                >
                                    <Plus className="mr-2 h-4 w-4" /> Eerste paper toevoegen
                                </Button>
                            </div>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="signals" className="mt-0">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Feed Column */}
                        <div className="lg:col-span-2 space-y-6">
                            <CreateSignalForm
                                currentUserId={TEMP_USER_ID}
                                onSuccess={fetchSignals}
                            />

                            <div className="space-y-4">
                                {isLoadingSignals ? (
                                    <div className="text-center p-8 text-muted-foreground">Signalen laden...</div>
                                ) : signals.length === 0 ? (
                                    <div className="text-center p-12 bg-card/30 rounded-xl border border-dashed border-emerald-500/20 text-muted-foreground">
                                        Nog geen signalen. Deel als eerste je observatie!
                                    </div>
                                ) : (
                                    signals.map(signal => (
                                        <SignalCard
                                            key={signal.id}
                                            signal={signal}
                                            currentUserId={TEMP_USER_ID}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Sidebar Column for Signals */}
                        <div className="space-y-6">
                            <Card className="bg-emerald-900/10 border-emerald-500/20">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                                        <Sprout className="h-4 w-4" />
                                        Trending Tags
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                        {['Schurft', 'Appel', 'Droogte', 'Luizen'].map(t => (
                                            <Badge key={t} variant="secondary" className="bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer">
                                                #{t}
                                            </Badge>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-emerald-900/10 border-emerald-500/20">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium text-emerald-400">
                                        Over Field Signals
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground leading-relaxed">
                                    Deel directe observaties uit de boomgaard. Foto's, waarschuwingen en adviezen komen hier samen voor het hele team.
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            <UploadModal open={isUploadOpen} onOpenChange={setIsUploadOpen} />
        </div>
    );
}

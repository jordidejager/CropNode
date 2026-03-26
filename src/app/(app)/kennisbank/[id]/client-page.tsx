'use client';

import * as React from 'react';
import {
    ArrowLeft,
    Download,
    Share2,
    Sparkles,
    MessageSquare,
    Tag,
    ChevronRight,
    Info,
    BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface PaperDetailClientProps {
    id: string;
}

export function PaperDetailClient({ id }: PaperDetailClientProps) {
    const router = useRouter();

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-emerald-500/10 bg-card/30 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/kennisbank')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold text-foreground truncate max-w-[600px]">
                            Optimale stikstofgift bij Elstar in kleigrond
                        </h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/5 text-emerald-400 border-emerald-500/20">
                                Cultivation
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">•</span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Gepubliceerd: 1 Maart 2024</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10">
                        <Download className="mr-2 h-4 w-4" /> Download PDF
                    </Button>
                    <Button variant="outline" size="sm" className="border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10">
                        <Share2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Main Content (Split View) */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: PDF Viewer */}
                <div className="flex-1 bg-muted/30 relative flex flex-col items-center justify-center p-8 border-r border-emerald-500/10">
                    <div className="w-full h-full bg-white rounded-lg shadow-2xl flex items-center justify-center relative group overflow-hidden">
                        {/* Placeholder for iframe/pdf object */}
                        <div className="flex flex-col items-center text-slate-400">
                            <BookOpen className="h-16 w-16 mb-4 opacity-20" />
                            <p className="text-sm font-medium">PDF Viewer Placeholder</p>
                            <p className="text-xs opacity-60">Hier wordt de PDF van het onderzoek getoond.</p>
                        </div>

                        {/* Simple visual indicator for PDF pages */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 px-3 py-1.5 rounded-full text-[10px] text-white backdrop-blur">
                            Pagina 1 van 12
                        </div>
                    </div>
                </div>

                {/* Right: AI Analysis Panel */}
                <div className="w-[450px] bg-card/20 backdrop-blur-md flex flex-col overflow-hidden">
                    <Tabs defaultValue="analysis" className="flex flex-col h-full">
                        <div className="px-6 pt-6 mb-4">
                            <TabsList className="w-full bg-emerald-950/20 p-1 border border-emerald-500/10">
                                <TabsTrigger value="analysis" className="flex-1 gap-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                                    <Sparkles className="h-3.5 w-3.5" /> Analyse
                                </TabsTrigger>
                                <TabsTrigger value="chat" className="flex-1 gap-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                                    <MessageSquare className="h-3.5 w-3.5" /> Chat
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="px-6 pb-6">
                                <TabsContent value="analysis" className="mt-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                    {/* Summary Section */}
                                    <section>
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-6 w-1 bg-emerald-500 rounded-full" />
                                            <h3 className="font-bold text-emerald-400">AI Samenvatting</h3>
                                        </div>
                                        <Card className="bg-emerald-900/5 border-emerald-500/10 shadow-none">
                                            <CardContent className="p-4 text-sm leading-relaxed text-muted-foreground">
                                                Dit onderzoek behandelt de effecten van verschillende stikstof-applicatiestrategieën voor het ras Elstar op kleigronden in Nederland. De belangrijkste bevinding is dat een gesplitste gift (50% vroeg in het voorjaar en 50% post-bloei) leidt tot een verbeterde vruchtzetting en een hogere gemiddelde vruchtmaat (75-80mm) zonder in te leveren op de kleurontwikkeling.
                                            </CardContent>
                                        </Card>
                                    </section>

                                    {/* Key Takeaways */}
                                    <section>
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-6 w-1 bg-emerald-500 rounded-full" />
                                            <h3 className="font-bold text-emerald-400">Belangrijkste Adviezen</h3>
                                        </div>
                                        <div className="space-y-3">
                                            {[
                                                "Hanteer een seizoengift van 60-80kg N/ha op zware klei.",
                                                "Splitsing van de gift is essentieel voor vruchtmaat.",
                                                "Directe invloed op houdbaarheid geconstateerd bij giften {'>'}100kg."
                                            ].map((item, i) => (
                                                <div key={i} className="flex gap-3 text-sm">
                                                    <ChevronRight className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                                                    <p className="text-muted-foreground">{item}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Tags & Metadata */}
                                    <section>
                                        <div className="flex items-center gap-2 mb-3">
                                            <Tag className="h-4 w-4 text-emerald-500" />
                                            <h3 className="font-bold text-emerald-400">Metadata</h3>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {['Elstar', 'Kleigrond', 'Stikstof', 'WUR', 'Hardfruit'].map(tag => (
                                                <Badge key={tag} variant="outline" className="bg-secondary/50 border-emerald-500/10">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Verdict Info */}
                                    <div className="border border-emerald-500/10 rounded-lg p-4 bg-emerald-900/10 flex items-start gap-3">
                                        <Info className="h-5 w-5 text-emerald-500 shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Verdict: Praktisch</p>
                                            <p className="text-xs text-muted-foreground mt-1 leading-normal">
                                                Dit onderzoek bevat direct toepasbare tabellen voor dosering in het veld.
                                            </p>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="chat" className="mt-0 h-[600px] flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
                                        <div className="bg-emerald-500/10 p-3 rounded-full mb-3">
                                            <MessageSquare className="h-6 w-6 text-emerald-500" />
                                        </div>
                                        <p className="text-sm font-medium">Stel vragen over dit paper</p>
                                        <p className="text-xs max-w-[200px] mt-1">Chat-functionaliteit wordt later toegevoegd in Stap 3.</p>
                                    </div>

                                    {/* Chat Input Placeholder */}
                                    <div className="mt-auto p-4 border border-emerald-500/20 rounded-xl bg-background/50">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 text-sm text-placeholder">Vraag iets over stikstofgift...</div>
                                            <Button size="icon" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-500">
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>
                            </div>
                        </ScrollArea>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}

'use client';

import * as React from 'react';
import { Suspense, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Clock,
    FileText,
    CheckCircle2,
    Package,
    MapPin,
    Calendar,
    Trash2,
    Play,
    MoreHorizontal,
    Plus,
    Loader2,
    Eye,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useConversations, useDeleteConversation, type ConversationListItem } from '@/hooks/use-data';

type FilterStatus = 'all' | 'draft' | 'completed';

function TimelineContent() {
    const router = useRouter();
    const { toast } = useToast();
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

    // React Query: fetch conversations based on filter
    const queryStatus = filter === 'all' ? undefined : filter;
    const { data: conversations = [], isLoading } = useConversations(queryStatus);

    // React Query: delete mutation
    const deleteConversationMutation = useDeleteConversation();

    // Handle resume session
    const handleResume = useCallback((id: string) => {
        router.push(`/command-center/smart-input?session_id=${id}`);
    }, [router]);

    // Handle delete
    const handleDelete = useCallback(async () => {
        if (!conversationToDelete) return;

        try {
            const result = await deleteConversationMutation.mutateAsync(conversationToDelete);
            if (result.success) {
                toast({ title: 'Verwijderd' });
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error('Error deleting conversation:', error);
            toast({ variant: 'destructive', title: 'Fout', description: error.message });
        } finally {
            setDeleteDialogOpen(false);
            setConversationToDelete(null);
        }
    }, [conversationToDelete, deleteConversationMutation, toast]);

    // Get status badge
    const getStatusBadge = (status: 'draft' | 'active' | 'completed') => {
        switch (status) {
            case 'draft':
                return (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                        <FileText className="h-3 w-3 mr-1" />
                        Concept
                    </Badge>
                );
            case 'active':
                return (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        <Clock className="h-3 w-3 mr-1" />
                        Actief
                    </Badge>
                );
            case 'completed':
                return (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Voltooid
                    </Badge>
                );
        }
    };

    // Filter counts (calculated from cached data when showing all)
    const { draftCount, completedCount } = useMemo(() => {
        return {
            draftCount: conversations.filter(c => c.status === 'draft').length,
            completedCount: conversations.filter(c => c.status === 'completed').length,
        };
    }, [conversations]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Tijdlijn</h1>
                    <p className="text-sm text-white/50 mt-1">
                        Beheer je opgeslagen sessies en concepten
                    </p>
                </div>
                <Button
                    onClick={() => router.push('/command-center/smart-input')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Nieuwe Sessie
                </Button>
            </div>

            {/* Filters */}
            <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterStatus)} className="w-full">
                <TabsList className="bg-white/5 border border-white/10">
                    <TabsTrigger
                        value="all"
                        className="data-[state=active]:bg-white/10 data-[state=active]:text-white"
                    >
                        Alles
                        <span className="ml-2 text-xs text-white/40">({conversations.length})</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="draft"
                        className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400"
                    >
                        Concepten
                        <span className="ml-2 text-xs text-white/40">({draftCount})</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="completed"
                        className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400"
                    >
                        Voltooid
                        <span className="ml-2 text-xs text-white/40">({completedCount})</span>
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Content */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                        <Clock className="h-8 w-8 text-white/20" />
                    </div>
                    <p className="text-white/60 mb-2">
                        {filter === 'draft' ? 'Geen concepten' :
                            filter === 'completed' ? 'Geen voltooide sessies' :
                                'Geen sessies gevonden'}
                    </p>
                    <p className="text-sm text-white/30 mb-4">
                        Start een nieuwe sessie via Slimme Invoer
                    </p>
                    <Button
                        onClick={() => router.push('/command-center/smart-input')}
                        variant="outline"
                        className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Nieuwe Sessie
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {conversations.map((conversation) => (
                        <div
                            key={conversation.id}
                            className="group relative bg-white/[0.03] rounded-xl border border-white/[0.06] hover:border-emerald-500/30 hover:bg-white/[0.05] transition-all cursor-pointer"
                            onClick={() => handleResume(conversation.id)}
                        >
                            {/* Card Content */}
                            <div className="p-4 space-y-3">
                                {/* Header */}
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-semibold text-white truncate pr-2">
                                            {conversation.title}
                                        </h3>
                                        <p className="text-xs text-white/40 mt-1">
                                            {formatDistanceToNow(new Date(conversation.last_updated), {
                                                addSuffix: true,
                                                locale: nl
                                            })}
                                        </p>
                                    </div>
                                    {getStatusBadge(conversation.status)}
                                </div>

                                {/* Summary */}
                                <div className="flex items-center gap-4 text-xs text-white/50">
                                    {conversation.draft_data?.products && conversation.draft_data.products.length > 0 && (
                                        <div className="flex items-center gap-1">
                                            <Package className="h-3.5 w-3.5" />
                                            <span>{conversation.draft_data.products.length} middelen</span>
                                        </div>
                                    )}
                                    {conversation.draft_data?.plots && conversation.draft_data.plots.length > 0 && (
                                        <div className="flex items-center gap-1">
                                            <MapPin className="h-3.5 w-3.5" />
                                            <span>{conversation.draft_data.plots.length} percelen</span>
                                        </div>
                                    )}
                                </div>

                                {/* Date */}
                                {conversation.draft_data?.date && (
                                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                                        <Calendar className="h-3.5 w-3.5" />
                                        <span>
                                            {format(new Date(conversation.draft_data.date), 'd MMMM yyyy', { locale: nl })}
                                        </span>
                                    </div>
                                )}

                                {/* Products Preview */}
                                {conversation.draft_data?.products && conversation.draft_data.products.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {conversation.draft_data.products.slice(0, 3).map((product, i) => (
                                            <span
                                                key={i}
                                                className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-white/60 truncate max-w-[100px]"
                                            >
                                                {product.product}
                                            </span>
                                        ))}
                                        {conversation.draft_data.products.length > 3 && (
                                            <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-white/40">
                                                +{conversation.draft_data.products.length - 3}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
                                {conversation.status === 'completed' ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push('/crop-care/logs');
                                        }}
                                    >
                                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                                        Bekijk Spuitschrift
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleResume(conversation.id);
                                        }}
                                    >
                                        <Play className="h-3.5 w-3.5 mr-1.5" />
                                        Hervatten
                                    </Button>
                                )}

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10"
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-slate-900 border-white/10">
                                        <DropdownMenuItem
                                            className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConversationToDelete(conversation.id);
                                                setDeleteDialogOpen(true);
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Verwijderen
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent className="bg-slate-900 border-white/10">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Sessie verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/60">
                            Deze actie kan niet ongedaan worden gemaakt. De sessie en alle bijbehorende gegevens worden permanent verwijderd.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                            Annuleren
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleteConversationMutation.isPending}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {deleteConversationMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            Verwijderen
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function TimelineSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-8 bg-white/5 rounded w-32" />
            <div className="h-10 bg-white/5 rounded w-64" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-48 bg-white/5 rounded-xl" />
                ))}
            </div>
        </div>
    );
}

// Wrap in Suspense for Next.js 13+ App Router compatibility
export default function TimelinePage() {
    return (
        <Suspense fallback={<TimelineSkeleton />}>
            <TimelineContent />
        </Suspense>
    );
}

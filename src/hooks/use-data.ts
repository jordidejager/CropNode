'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
    getParcels,
    getSprayableParcels,  // New: uses v_sprayable_parcels view
    getLogbookEntries,
    getSpuitschriftEntries,
    getAllCtgbProducts,
    getFertilizers,
    getInventoryMovements,
    getParcelHistoryEntries,
    searchCtgbProducts,
    getCtgbProductByName,
    getTaskTypes,
    getTaskLogs,
    getTaskStats,
    addTaskLog,
    deleteTaskLog,
    getActiveTaskSessions,
    startTaskSession,
    updateActiveTaskSession,
    stopTaskSession,
    deleteActiveTaskSession,
    type SprayableParcel,
} from '@/lib/supabase-store';
import {
    getConversations,
    deleteConversation,
    type ConversationListItem,
} from '@/app/actions';
import type {
    Parcel,
    LogbookEntry,
    SpuitschriftEntry,
    CtgbProduct,
    FertilizerProduct,
    InventoryMovement,
    ParcelHistoryEntry,
    TaskType,
    TaskLog,
    TaskLogEnriched,
    ActiveTaskSession,
} from '@/lib/types';

// ============================================
// Query Keys - Centralized for cache management
// ============================================

export const queryKeys = {
    // Parcels
    parcels: ['parcels'] as const,
    parcel: (id: string) => ['parcels', id] as const,

    // Logbook (Slimme Invoer)
    logbookEntries: ['logbook'] as const,
    logbookEntry: (id: string) => ['logbook', id] as const,

    // Spuitschrift
    spuitschriftEntries: ['spuitschrift'] as const,
    spuitschriftPaginated: (page: number, pageSize: number) => ['spuitschrift', 'paginated', page, pageSize] as const,

    // CTGB Products (Middelenoverzicht)
    ctgbProducts: ['ctgb-products'] as const,
    ctgbProductsList: ['ctgb-products', 'list'] as const, // Lightweight list (id, naam)
    ctgbProduct: (id: string) => ['ctgb-products', id] as const,
    ctgbSearch: (query: string) => ['ctgb-products', 'search', query] as const,

    // Fertilizers (Bemesting)
    fertilizers: ['fertilizers'] as const,
    fertilizersList: ['fertilizers', 'list'] as const,
    fertilizer: (id: string) => ['fertilizers', id] as const,

    // Inventory (Voorraad)
    inventory: ['inventory'] as const,
    inventoryMovements: ['inventory', 'movements'] as const,

    // Parcel History
    parcelHistory: ['parcel-history'] as const,
    parcelHistoryByParcel: (parcelId: string) => ['parcel-history', parcelId] as const,

    // Dashboard aggregates
    dashboardStats: ['dashboard', 'stats'] as const,

    // Team & Tasks
    taskTypes: ['task-types'] as const,
    taskLogs: ['task-logs'] as const,
    taskStats: ['task-stats'] as const,
    activeTaskSessions: ['active-task-sessions'] as const,

    // Conversations (Timeline)
    conversations: ['conversations'] as const,
    conversationsByStatus: (status?: 'draft' | 'active' | 'completed') => ['conversations', status] as const,
};

// ============================================
// Parcels Hooks
// ============================================

/**
 * Fetch sprayable parcels from v_sprayable_parcels view.
 * Sub-parcels are the "unit of work" with accurate area and crop/variety.
 */
export function useParcels() {
    return useQuery({
        queryKey: queryKeys.parcels,
        queryFn: getSprayableParcels,  // Uses new view
        staleTime: 10 * 60 * 1000, // 10 minutes - parcels don't change often
    });
}

/**
 * Legacy: Fetch parcels from parcels table (for backward compatibility)
 */
export function useLegacyParcels() {
    return useQuery({
        queryKey: ['parcels', 'legacy'],
        queryFn: getParcels,
        staleTime: 10 * 60 * 1000,
    });
}

// ============================================
// Logbook Hooks (Slimme Invoer)
// ============================================

export function useLogbookEntries() {
    return useQuery({
        queryKey: queryKeys.logbookEntries,
        queryFn: getLogbookEntries,
        staleTime: 30 * 1000, // 30 seconds - logbook changes frequently
    });
}

// ============================================
// Spuitschrift Hooks with Pagination
// ============================================

export function useSpuitschriftEntries() {
    return useQuery({
        queryKey: queryKeys.spuitschriftEntries,
        queryFn: getSpuitschriftEntries,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

// Paginated version for large datasets
export function useSpuitschriftPaginated(pageSize: number = 20) {
    return useInfiniteQuery({
        queryKey: ['spuitschrift', 'infinite', pageSize],
        queryFn: async ({ pageParam = 0 }) => {
            // Note: We'll need to add pagination support to the supabase-store
            const allEntries = await getSpuitschriftEntries();
            const start = pageParam * pageSize;
            const end = start + pageSize;
            return {
                entries: allEntries.slice(start, end),
                nextPage: end < allEntries.length ? pageParam + 1 : undefined,
                totalCount: allEntries.length,
            };
        },
        getNextPageParam: (lastPage) => lastPage.nextPage,
        initialPageParam: 0,
        staleTime: 2 * 60 * 1000,
    });
}

// ============================================
// CTGB Products Hooks (Middelenoverzicht)
// ============================================

// Full products with all details (for detail view)
export function useCtgbProducts() {
    return useQuery({
        queryKey: queryKeys.ctgbProducts,
        queryFn: getAllCtgbProducts,
        staleTime: 30 * 60 * 1000, // 30 minutes - products rarely change
    });
}

// Search products
export function useCtgbSearch(query: string) {
    return useQuery({
        queryKey: queryKeys.ctgbSearch(query),
        queryFn: () => searchCtgbProducts(query),
        enabled: query.length >= 2,
        staleTime: 5 * 60 * 1000,
    });
}

// Single product detail (by name)
export function useCtgbProduct(name: string) {
    return useQuery({
        queryKey: queryKeys.ctgbProduct(name),
        queryFn: () => getCtgbProductByName(name),
        enabled: !!name,
        staleTime: 30 * 60 * 1000,
    });
}

// ============================================
// Fertilizers Hooks (Bemesting)
// ============================================

export function useFertilizers() {
    return useQuery({
        queryKey: queryKeys.fertilizers,
        queryFn: getFertilizers,
        staleTime: 30 * 60 * 1000, // 30 minutes
    });
}

// ============================================
// Inventory Hooks (Voorraad)
// ============================================

export function useInventory() {
    return useQuery({
        queryKey: queryKeys.inventoryMovements,
        queryFn: getInventoryMovements,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

// Computed hook for stock overview (processes movements into stock levels)
export function useStockOverview() {
    const inventoryQuery = useInventory();
    const productsQuery = useCtgbProducts();

    const stock = React.useMemo(() => {
        if (!inventoryQuery.data) return [];

        const movements = inventoryQuery.data;
        const productsInStock = new Set(movements.map(m => m.productName));

        return Array.from(productsInStock).map(productName => {
            const productMovements = movements.filter(m => m.productName === productName);
            const currentStock = productMovements.reduce((sum, m) => sum + m.quantity, 0);
            const unit = productMovements.find(m => m.unit)?.unit || 'onbekend';

            return { productName, stock: currentStock, unit };
        }).sort((a, b) => a.productName.localeCompare(b.productName));
    }, [inventoryQuery.data]);

    const allProductNames = React.useMemo(() => {
        if (!productsQuery.data) return [];
        return [...new Set(productsQuery.data.map(p => p.naam))].filter(Boolean) as string[];
    }, [productsQuery.data]);

    return {
        stock,
        allProducts: allProductNames,
        isLoading: inventoryQuery.isLoading || productsQuery.isLoading,
        isError: inventoryQuery.isError || productsQuery.isError,
        error: inventoryQuery.error || productsQuery.error,
        refetch: () => {
            inventoryQuery.refetch();
            productsQuery.refetch();
        },
    };
}

// Product movements for detail page
export function useProductMovements(productName: string) {
    const inventoryQuery = useInventory();

    const movements = React.useMemo(() => {
        if (!inventoryQuery.data || !productName) return [];

        return inventoryQuery.data
            .filter(m => m.productName === productName)
            .sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [inventoryQuery.data, productName]);

    const currentStock = React.useMemo(() => {
        return movements.reduce((sum, m) => sum + m.quantity, 0);
    }, [movements]);

    const unit = movements.find(m => m.unit)?.unit || 'onbekend';

    return {
        movements,
        currentStock,
        unit,
        isLoading: inventoryQuery.isLoading,
        isError: inventoryQuery.isError,
        error: inventoryQuery.error,
        refetch: inventoryQuery.refetch,
    };
}

// ============================================
// Parcel History Hooks
// ============================================

export function useParcelHistory() {
    return useQuery({
        queryKey: queryKeys.parcelHistory,
        queryFn: getParcelHistoryEntries,
        staleTime: 5 * 60 * 1000,
    });
}

// ============================================
// Dashboard Stats Hook (aggregated data)
// ============================================

export function useDashboardStats() {
    const queryClient = useQueryClient();

    return useQuery({
        queryKey: queryKeys.dashboardStats,
        queryFn: async () => {
            // Fetch all needed data in parallel
            // Using getSprayableParcels() for accurate sub-parcel data
            const [parcels, logbook, spuitschrift, inventory, parcelHistory] = await Promise.all([
                getSprayableParcels(),  // Uses v_sprayable_parcels view
                getLogbookEntries(),
                getSpuitschriftEntries(),
                getInventoryMovements(),
                getParcelHistoryEntries(),
            ]);

            // Cache individual results
            queryClient.setQueryData(queryKeys.parcels, parcels);
            queryClient.setQueryData(queryKeys.logbookEntries, logbook);
            queryClient.setQueryData(queryKeys.spuitschriftEntries, spuitschrift);
            queryClient.setQueryData(queryKeys.inventoryMovements, inventory);
            queryClient.setQueryData(queryKeys.parcelHistory, parcelHistory);

            // Calculate stats
            const pendingEntries = logbook.filter(e => e.status !== 'Akkoord' && e.status !== 'Analyseren...').length;
            // SprayableParcel has 'area' directly (from sub_parcels)
            const totalArea = parcels.reduce((sum, p) => sum + (p.area || 0), 0);

            // Recent activity (last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const recentSprayings = spuitschrift.filter(s => new Date(s.date) >= sevenDaysAgo).length;

            // Inventory warnings
            const lowStockItems = inventory.filter(i => {
                // Simple heuristic: if we've used a product recently but stock is low
                return i.type === 'usage' && i.quantity < 1;
            }).length;

            return {
                parcels,
                logbook,
                spuitschrift,
                inventory,
                parcelHistory,
                stats: {
                    totalParcels: parcels.length,
                    totalArea,
                    pendingEntries,
                    recentSprayings,
                    lowStockItems,
                    confirmedThisWeek: recentSprayings,
                },
            };
        },
        staleTime: 60 * 1000, // 1 minute
    });
}

// ============================================
// Cache Invalidation Helpers
// ============================================

export function useInvalidateQueries() {
    const queryClient = useQueryClient();

    return {
        invalidateLogbook: () => queryClient.invalidateQueries({ queryKey: queryKeys.logbookEntries }),
        invalidateSpuitschrift: () => queryClient.invalidateQueries({ queryKey: queryKeys.spuitschriftEntries }),
        invalidateParcels: () => queryClient.invalidateQueries({ queryKey: queryKeys.parcels }),
        invalidateInventory: () => queryClient.invalidateQueries({ queryKey: queryKeys.inventoryMovements }),
        invalidateAll: () => queryClient.invalidateQueries(),
        invalidateDashboard: () => queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats }),
        invalidateConversations: () => queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
    };
}

// ============================================
// Prefetch Helpers
// ============================================

export function usePrefetch() {
    const queryClient = useQueryClient();

    return {
        prefetchParcels: () => queryClient.prefetchQuery({
            queryKey: queryKeys.parcels,
            queryFn: getSprayableParcels,  // Uses new view
        }),
        prefetchCtgbProducts: () => queryClient.prefetchQuery({
            queryKey: queryKeys.ctgbProducts,
            queryFn: getAllCtgbProducts,
        }),
        prefetchFertilizers: () => queryClient.prefetchQuery({
            queryKey: queryKeys.fertilizers,
            queryFn: getFertilizers,
        }),
    };
}

// ============================================
// Team & Tasks Hooks (Urenregistratie)
// ============================================

export function useTaskTypes() {
    return useQuery({
        queryKey: queryKeys.taskTypes,
        queryFn: getTaskTypes,
        staleTime: 30 * 60 * 1000, // 30 minutes - task types rarely change
    });
}

export function useTaskLogs() {
    return useQuery({
        queryKey: queryKeys.taskLogs,
        queryFn: getTaskLogs,
        staleTime: 30 * 1000, // 30 seconds - logs change frequently
    });
}

export function useTaskStats() {
    return useQuery({
        queryKey: queryKeys.taskStats,
        queryFn: getTaskStats,
        staleTime: 60 * 1000, // 1 minute
    });
}

export function useAddTaskLog() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: addTaskLog,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.taskLogs });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskStats });
        },
    });
}

export function useDeleteTaskLog() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteTaskLog,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.taskLogs });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskStats });
        },
    });
}

// ============================================
// Active Task Sessions Hooks (Live Timer)
// ============================================

export function useActiveTaskSessions() {
    return useQuery({
        queryKey: queryKeys.activeTaskSessions,
        queryFn: getActiveTaskSessions,
        staleTime: 10 * 1000, // 10 seconds - live timer needs fresh data
        refetchInterval: 60 * 1000, // Refetch every minute for timer updates
    });
}

export function useStartTaskSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: startTaskSession,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskSessions });
        },
    });
}

export function useUpdateActiveTaskSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: { startTime?: Date; peopleCount?: number; notes?: string | null } }) =>
            updateActiveTaskSession(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskSessions });
        },
    });
}

export function useStopTaskSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ sessionId, endTime, hoursPerPerson }: { sessionId: string; endTime: Date; hoursPerPerson: number }) =>
            stopTaskSession(sessionId, endTime, hoursPerPerson),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskSessions });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskLogs });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskStats });
        },
    });
}

export function useDeleteActiveTaskSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteActiveTaskSession,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskSessions });
        },
    });
}

// ============================================
// Conversations Hooks (Timeline)
// ============================================

export function useConversations(status?: 'draft' | 'active' | 'completed') {
    return useQuery({
        queryKey: queryKeys.conversationsByStatus(status),
        queryFn: () => getConversations(status),
        staleTime: 30 * 1000, // 30 seconds - conversations change frequently
    });
}

export function useDeleteConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteConversation,
        onSuccess: () => {
            // Invalidate all conversation queries to refresh lists
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        },
    });
}

// Re-export ConversationListItem type for convenience
export type { ConversationListItem };

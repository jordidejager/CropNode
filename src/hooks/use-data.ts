'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { filterFertilizationEntries, filterCropProtectionEntries } from '@/lib/fertilization-utils';
import {
    getParcels,
    getSprayableParcels,  // New: uses v_sprayable_parcels view
    getParcelGroups,
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
    addTaskType,
    updateTaskType,
    deleteTaskLog,
    getActiveTaskSessions,
    startTaskSession,
    updateActiveTaskSession,
    stopTaskSession,
    stopTaskSessionMultiDay,
    deleteActiveTaskSession,
    getWorkSchedule,
    updateWorkSchedule,
    getUserSetting,
    setUserSetting,
    // Storage (Koelcelbeheer)
    getStorageCells,
    getStorageCell,
    addStorageCell,
    updateStorageCell,
    deleteStorageCell,
    getStoragePositions,
    upsertStoragePosition,
    clearStoragePosition,
    // Storage Complex
    getStorageComplexes,
    getStorageComplex,
    getOrCreateDefaultComplex,
    addStorageComplex,
    updateStorageComplex,
    deleteStorageComplex,
    getStorageCellsByComplex,
    // Cell Sub-Parcels (new in migration 008)
    getCellSubParcels,
    createCellSubParcel,
    updateCellSubParcel,
    deleteCellSubParcel,
    getNextAvailableColor,
    // Position Contents (new in migration 008)
    getPositionContents,
    getPositionStacks,
    addPositionContent,
    updatePositionContent,
    deletePositionContent,
    clearPositionContents,
    assignSubParcelToPositions,
    fillRowWithSubParcel,
    fillColumnWithSubParcel,
    fillAllEmptyPositions,
    // Harvest Registrations (new in migration 009)
    getHarvestRegistrations,
    getHarvestsForDate,
    getAvailableHarvestsForStorage,
    createHarvestRegistration,
    updateHarvestRegistration,
    deleteHarvestRegistration,
    linkCellSubParcelToHarvest,
    getHarvestSeasons,
    // Afzetstromen (migration 057)
    getBatches,
    getBatchById,
    createBatch,
    updateBatch,
    deleteBatch,
    getBatchEvents,
    getBatchEventsByType,
    createBatchEvent,
    updateBatchEvent,
    deleteBatchEvent,
    getBatchDocuments,
    createBatchDocumentRecord,
    updateBatchDocument,
    deleteBatchDocument,
    getBatchDocumentSignedUrl,
    getBatchSeasons,
    getKnownVarieties,
    getKnownHarvestYears,
    getBatchParcels,
    addBatchParcels,
    updateBatchParcel,
    deleteBatchParcel,
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
    StorageComplex,
    StorageCell,
    StorageCellSummary,
    StoragePosition,
    StoragePositionInput,
    CellSubParcel,
    CellSubParcelInput,
    PositionContent,
    PositionContentInput,
    PositionStack,
    HarvestRegistration,
    HarvestRegistrationInput,
    Batch,
    BatchInput,
    BatchStatus,
    BatchEvent,
    BatchEventInput,
    BatchEventType,
    BatchDocument,
    BatchParcelLink,
    BatchParcelLinkInput,
    BatchDocumentInput,
} from '@/lib/types';

// ============================================
// Query Keys - Centralized for cache management
// ============================================

export const queryKeys = {
    // Parcels
    parcels: ['parcels'] as const,
    parcel: (id: string) => ['parcels', id] as const,
    parcelGroups: ['parcel-groups'] as const,

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

    // User Settings
    userSetting: (key: string) => ['user-settings', key] as const,

    // Team & Tasks
    taskTypes: ['task-types'] as const,
    taskLogs: ['task-logs'] as const,
    taskStats: ['task-stats'] as const,
    activeTaskSessions: ['active-task-sessions'] as const,
    workSchedule: ['work-schedule'] as const,

    // Conversations (Timeline)
    conversations: ['conversations'] as const,
    conversationsByStatus: (status?: 'draft' | 'active' | 'completed') => ['conversations', status] as const,

    // Storage (Koelcelbeheer)
    storageCells: ['storage-cells'] as const,
    storageCell: (id: string) => ['storage-cells', id] as const,
    storagePositions: (cellId: string) => ['storage-positions', cellId] as const,

    // Storage Complex
    storageComplexes: ['storage-complexes'] as const,
    storageComplex: (id: string) => ['storage-complexes', id] as const,
    defaultStorageComplex: ['storage-complexes', 'default'] as const,
    storageCellsByComplex: (complexId: string) => ['storage-cells', 'by-complex', complexId] as const,

    // Cell Sub-Parcels (new in migration 008)
    cellSubParcels: (cellId: string) => ['cell-sub-parcels', cellId] as const,
    cellSubParcel: (id: string) => ['cell-sub-parcels', 'single', id] as const,
    nextAvailableColor: (cellId: string) => ['cell-sub-parcels', 'color', cellId] as const,

    // Position Contents (new in migration 008)
    positionContents: (cellId: string) => ['position-contents', cellId] as const,
    positionStacks: (cellId: string) => ['position-stacks', cellId] as const,

    // BRP Gewashistorie (migration 016)
    gewasHistorie: (parcelId: string) => ['gewas-historie', parcelId] as const,

    // Perceelprofiel & Grondmonsters (migration 040)
    parcelProfile: (subParcelId: string) => ['parcel-profile', subParcelId] as const,
    soilAnalyses: (subParcelId: string) => ['soil-analyses', subParcelId] as const,

    // Harvest Registrations (new in migration 009)
    harvestRegistrations: ['harvest-registrations'] as const,
    harvestRegistrationsBySeason: (season: string) => ['harvest-registrations', 'season', season] as const,
    harvestRegistrationsByDate: (date: string) => ['harvest-registrations', 'date', date] as const,
    harvestRegistration: (id: string) => ['harvest-registrations', id] as const,
    availableHarvestsForStorage: ['harvest-registrations', 'available'] as const,
    harvestSeasons: ['harvest-seasons'] as const,

    // Afzetstromen (migration 057)
    batches: ['batches'] as const,
    batchesFiltered: (filter: Record<string, unknown>) => ['batches', 'filter', filter] as const,
    batch: (id: string) => ['batches', id] as const,
    batchEvents: (batchId: string) => ['batch-events', batchId] as const,
    batchEventsByType: (type: string, filter?: Record<string, unknown>) =>
        ['batch-events', 'type', type, filter] as const,
    batchDocuments: (batchId: string | null) =>
        ['batch-documents', batchId ?? 'inbox'] as const,
    batchDocumentsInbox: ['batch-documents', 'inbox'] as const,
    batchSeasons: ['batch-seasons'] as const,
    knownVarieties: ['known-varieties'] as const,
    knownHarvestYears: ['known-harvest-years'] as const,
    batchParcels: (batchId: string) => ['batch-parcels', batchId] as const,
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

export function useParcelGroups() {
    return useQuery({
        queryKey: queryKeys.parcelGroups,
        queryFn: getParcelGroups,
        staleTime: 10 * 60 * 1000,
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
// BRP Gewashistorie Hooks
// ============================================

export function useGewasHistorie(parcelId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.gewasHistorie(parcelId || ''),
        queryFn: async () => {
            if (!parcelId) return [];
            const res = await fetch(`/api/parcels/${parcelId}/gewashistorie`);
            if (!res.ok) return [];
            const json = await res.json();
            return json.data || [];
        },
        enabled: !!parcelId,
        staleTime: 24 * 60 * 60 * 1000, // 24 hours
    });
}

export function useRefreshGewasHistorie(parcelId: string | undefined) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            if (!parcelId) throw new Error('No parcel ID');
            const res = await fetch(`/api/parcels/${parcelId}/gewashistorie`, {
                method: 'POST',
            });
            if (!res.ok) throw new Error('Fetch failed');
            const json = await res.json();
            return json.data;
        },
        onSuccess: (data) => {
            if (parcelId) {
                queryClient.setQueryData(queryKeys.gewasHistorie(parcelId), data?.data || data || []);
            }
        },
    });
}

// ============================================
// Perceelprofiel & Grondmonster Hooks
// ============================================

export function useParcelProfile(id: string | undefined, type: 'parcel' | 'sub_parcel' = 'sub_parcel') {
    return useQuery({
        queryKey: queryKeys.parcelProfile(id || ''),
        queryFn: async () => {
            if (!id) return null;
            const res = await fetch(`/api/parcels/${id}/profile?type=${type}`);
            const json = await res.json();
            return json.data ?? null;
        },
        enabled: !!id,
        staleTime: 5 * 60 * 1000,
    });
}

export function useUpdateParcelProfile(id: string, type: 'parcel' | 'sub_parcel' = 'sub_parcel') {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (profileData: Record<string, unknown>) => {
            const res = await fetch(`/api/parcels/${id}/profile?type=${type}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Fout bij opslaan');
            return json.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.parcelProfile(id) });
        },
    });
}

export function useSoilAnalyses(id: string | undefined, type: 'parcel' | 'sub_parcel' = 'sub_parcel') {
    return useQuery({
        queryKey: queryKeys.soilAnalyses(id || ''),
        queryFn: async () => {
            if (!id) return [];
            const res = await fetch(`/api/parcels/${id}/soil-analyses?type=${type}`);
            const json = await res.json();
            return json.data || [];
        },
        enabled: !!id,
        staleTime: 60 * 1000,
        // Poll elke 3s als er een analyse in 'processing' staat
        refetchInterval: (query) => {
            const data = query.state.data as any[] | undefined;
            if (data?.some((a: any) => a.extractie_status === 'processing')) return 3000;
            return false;
        },
    });
}

export function useUploadSoilAnalysis(id: string, type: 'parcel' | 'sub_parcel' = 'sub_parcel') {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`/api/parcels/${id}/soil-analyses/upload?type=${type}`, {
                method: 'POST',
                body: formData,
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Upload mislukt');
            return json.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.soilAnalyses(id) });
        },
    });
}

export function useApplyAnalysisToProfile(id: string, type: 'parcel' | 'sub_parcel' = 'sub_parcel') {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (analysisId: string) => {
            const res = await fetch(`/api/parcels/${id}/soil-analyses/${analysisId}/apply-to-profile?type=${type}`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Toepassen mislukt');
            return json.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.parcelProfile(id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.soilAnalyses(id) });
        },
    });
}

export function useDeleteSoilAnalysis(id: string, type: 'parcel' | 'sub_parcel' = 'sub_parcel') {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (analysisId: string) => {
            const res = await fetch(`/api/parcels/${id}/soil-analyses/${analysisId}?type=${type}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Verwijderen mislukt');
            return json.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.soilAnalyses(id) });
        },
    });
}

// ============================================
// Logbook Hooks (Slimme Invoer)
// ============================================

export function useLogbookEntries() {
    return useQuery({
        queryKey: queryKeys.logbookEntries,
        queryFn: () => getLogbookEntries(),
        staleTime: 30 * 1000, // 30 seconds - logbook changes frequently
    });
}

// ============================================
// Spuitschrift Hooks with Pagination
// ============================================

export function useSpuitschriftEntries() {
    return useQuery({
        queryKey: queryKeys.spuitschriftEntries,
        queryFn: () => getSpuitschriftEntries(),
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

// Filtered: only fertilization entries (for Bemestingsregister)
export function useFertilizationEntries() {
    const query = useSpuitschriftEntries();
    const data = useMemo(
        () => query.data ? filterFertilizationEntries(query.data) : [],
        [query.data]
    );
    return { ...query, data };
}

// Filtered: only crop protection entries (for Spuitschrift)
export function useCropProtectionEntries() {
    const query = useSpuitschriftEntries();
    const data = useMemo(
        () => query.data ? filterCropProtectionEntries(query.data) : [],
        [query.data]
    );
    return { ...query, data };
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
// Includes both crop protection (CTGB) and fertilizer products
export function useStockOverview() {
    const inventoryQuery = useInventory();
    const productsQuery = useCtgbProducts();
    const fertilizersQuery = useFertilizers();

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
        const ctgbNames = productsQuery.data?.map(p => p.naam).filter(Boolean) || [];
        const fertilizerNames = fertilizersQuery.data?.map((f: any) => f.name).filter(Boolean) || [];
        return [...new Set([...ctgbNames, ...fertilizerNames])] as string[];
    }, [productsQuery.data, fertilizersQuery.data]);

    return {
        stock,
        allProducts: allProductNames,
        isLoading: inventoryQuery.isLoading || productsQuery.isLoading || fertilizersQuery.isLoading,
        isError: inventoryQuery.isError || productsQuery.isError || fertilizersQuery.isError,
        error: inventoryQuery.error || productsQuery.error || fertilizersQuery.error,
        refetch: () => {
            inventoryQuery.refetch();
            productsQuery.refetch();
            fertilizersQuery.refetch();
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
        invalidateParcelGroups: () => queryClient.invalidateQueries({ queryKey: queryKeys.parcelGroups }),
        invalidateInventory: () => queryClient.invalidateQueries({ queryKey: queryKeys.inventoryMovements }),
        invalidateGewasHistorie: (parcelId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.gewasHistorie(parcelId) }),
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

export function useAddTaskType() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: { name: string; defaultHourlyRate: number }) =>
            addTaskType(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.taskTypes });
        },
    });
}

export function useUpdateTaskType() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: { name?: string; defaultHourlyRate?: number } }) =>
            updateTaskType(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.taskTypes });
        },
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

export function useStopTaskSessionMultiDay() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ sessionId, entries }: { sessionId: string; entries: Array<{ date: string; hoursPerPerson: number; peopleCount: number }> }) =>
            stopTaskSessionMultiDay(sessionId, entries),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskSessions });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskLogs });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskStats });
        },
    });
}

// ============================================
// Work Schedule Hooks
// ============================================

export function useWorkSchedule() {
    return useQuery({
        queryKey: queryKeys.workSchedule,
        queryFn: getWorkSchedule,
        staleTime: 30 * 60 * 1000, // 30 min - rarely changes
    });
}

export function useUpdateWorkSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateWorkSchedule,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workSchedule });
        },
    });
}

// ============================================
// User Settings Hooks
// ============================================

export function useUserSetting(key: string) {
    return useQuery({
        queryKey: queryKeys.userSetting(key),
        queryFn: () => getUserSetting(key),
        staleTime: 30 * 60 * 1000,
    });
}

export function useSetUserSetting() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ key, value }: { key: string; value: string }) =>
            setUserSetting(key, value),
        onSuccess: (_, { key }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.userSetting(key) });
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

// ============================================
// Storage Hooks (Koelcelbeheer)
// ============================================

/**
 * Fetch all storage cells with summary statistics
 */
export function useStorageCells() {
    return useQuery({
        queryKey: queryKeys.storageCells,
        queryFn: getStorageCells,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Fetch a single storage cell by ID
 */
export function useStorageCell(id: string) {
    return useQuery({
        queryKey: queryKeys.storageCell(id),
        queryFn: () => getStorageCell(id),
        enabled: !!id,
        staleTime: 2 * 60 * 1000,
    });
}

/**
 * Fetch all positions in a storage cell
 */
export function useStoragePositions(cellId: string) {
    return useQuery({
        queryKey: queryKeys.storagePositions(cellId),
        queryFn: () => getStoragePositions(cellId),
        enabled: !!cellId,
        staleTime: 30 * 1000, // 30 seconds - positions change frequently
    });
}

/**
 * Create a new storage cell
 */
export function useAddStorageCell() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: addStorageCell,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCells });
        },
    });
}

/**
 * Update a storage cell
 */
export function useUpdateStorageCell() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<StorageCell> }) =>
            updateStorageCell(id, updates),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCells });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(id) });
        },
    });
}

/**
 * Delete a storage cell
 */
export function useDeleteStorageCell() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteStorageCell,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCells });
        },
    });
}

/**
 * Upsert a storage position (create or update)
 */
export function useUpsertStoragePosition() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: upsertStoragePosition,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.storagePositions(data.cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCells });
        },
    });
}

/**
 * Clear a storage position (remove crate data)
 */
export function useClearStoragePosition() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ cellId, rowIndex, colIndex }: { cellId: string; rowIndex: number; colIndex: number }) =>
            clearStoragePosition(cellId, rowIndex, colIndex),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.storagePositions(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCells });
        },
    });
}

// ============================================
// Storage Complex Hooks
// ============================================

/**
 * Fetch all storage complexes
 */
export function useStorageComplexes() {
    return useQuery({
        queryKey: queryKeys.storageComplexes,
        queryFn: getStorageComplexes,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Fetch a single storage complex by ID
 */
export function useStorageComplex(id: string) {
    return useQuery({
        queryKey: queryKeys.storageComplex(id),
        queryFn: () => getStorageComplex(id),
        enabled: !!id,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Get or create the default storage complex
 */
export function useDefaultStorageComplex() {
    return useQuery({
        queryKey: queryKeys.defaultStorageComplex,
        queryFn: getOrCreateDefaultComplex,
        staleTime: 10 * 60 * 1000, // 10 minutes - default complex rarely changes
    });
}

/**
 * Create a new storage complex
 */
export function useAddStorageComplex() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: addStorageComplex,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.storageComplexes });
        },
    });
}

/**
 * Update a storage complex
 */
export function useUpdateStorageComplex() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<StorageComplex> }) =>
            updateStorageComplex(id, updates),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.storageComplexes });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageComplex(id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.defaultStorageComplex });
        },
    });
}

/**
 * Delete a storage complex
 */
export function useDeleteStorageComplex() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteStorageComplex,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.storageComplexes });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCells });
        },
    });
}

/**
 * Fetch all storage cells belonging to a specific complex
 */
export function useStorageCellsByComplex(complexId: string) {
    return useQuery({
        queryKey: queryKeys.storageCellsByComplex(complexId),
        queryFn: () => getStorageCellsByComplex(complexId),
        enabled: !!complexId,
        staleTime: 2 * 60 * 1000,
    });
}

// ============================================
// Cell Sub-Parcels Hooks (migration 008)
// ============================================

/**
 * Fetch all sub-parcels assigned to a storage cell
 */
export function useCellSubParcels(cellId: string) {
    return useQuery({
        queryKey: queryKeys.cellSubParcels(cellId),
        queryFn: () => getCellSubParcels(cellId),
        enabled: !!cellId,
        staleTime: 2 * 60 * 1000,
    });
}

/**
 * Create a new cell sub-parcel assignment
 */
export function useCreateCellSubParcel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createCellSubParcel,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(data.cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.nextAvailableColor(data.cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(data.cellId) });
        },
    });
}

/**
 * Update a cell sub-parcel
 */
export function useUpdateCellSubParcel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<CellSubParcelInput> }) =>
            updateCellSubParcel(id, updates),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(data.cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcel(data.id) });
        },
    });
}

/**
 * Delete a cell sub-parcel (cascades to position contents)
 */
export function useDeleteCellSubParcel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, cellId }: { id: string; cellId: string }) => deleteCellSubParcel(id),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.nextAvailableColor(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(cellId) });
        },
    });
}

/**
 * Get the next available color for a cell
 */
export function useNextAvailableColor(cellId: string) {
    return useQuery({
        queryKey: queryKeys.nextAvailableColor(cellId),
        queryFn: () => getNextAvailableColor(cellId),
        enabled: !!cellId,
        staleTime: 30 * 1000, // 30 seconds - can change when sub-parcels are added
    });
}

// ============================================
// Position Contents Hooks (migration 008)
// ============================================

/**
 * Fetch all position contents for a cell (raw data)
 */
export function usePositionContents(cellId: string) {
    return useQuery({
        queryKey: queryKeys.positionContents(cellId),
        queryFn: () => getPositionContents(cellId),
        enabled: !!cellId,
        staleTime: 1 * 60 * 1000,
    });
}

/**
 * Fetch aggregated position stacks for a cell (for rendering)
 */
export function usePositionStacks(cellId: string, cell: StorageCell | null) {
    return useQuery({
        queryKey: queryKeys.positionStacks(cellId),
        queryFn: () => getPositionStacks(cellId, cell!),
        enabled: !!cellId && !!cell,
        staleTime: 1 * 60 * 1000,
    });
}

/**
 * Add content to a position
 */
export function useAddPositionContent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: addPositionContent,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(data.cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(data.cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(data.cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(data.cellId) });
        },
    });
}

/**
 * Update position content
 */
export function useUpdatePositionContent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; cellId?: string; updates: Partial<PositionContentInput> }) =>
            updatePositionContent(id, updates),
        onSuccess: (_, { cellId }) => {
            if (cellId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(cellId) });
                queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(cellId) });
                queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
            } else {
                // Broad invalidation when cellId is not provided
                queryClient.invalidateQueries({ queryKey: ['positionContents'] });
                queryClient.invalidateQueries({ queryKey: ['positionStacks'] });
                queryClient.invalidateQueries({ queryKey: ['cellSubParcels'] });
            }
        },
    });
}

/**
 * Delete position content
 */
export function useDeletePositionContent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, cellId }: { id: string; cellId: string }) => deletePositionContent(id),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(cellId) });
        },
    });
}

/**
 * Clear all contents from a position
 */
export function useClearPositionContents() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ cellId, rowIndex, colIndex }: { cellId: string; rowIndex: number; colIndex: number }) =>
            clearPositionContents(cellId, rowIndex, colIndex),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(cellId) });
        },
    });
}

// ============================================
// Batch Assignment Hooks (migration 008)
// ============================================

/**
 * Assign a sub-parcel to multiple positions at once
 */
export function useAssignSubParcelToPositions() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            cellId,
            cellSubParcelId,
            positions,
        }: {
            cellId: string;
            cellSubParcelId: string;
            positions: Array<{ rowIndex: number; colIndex: number; stackCount: number }>;
        }) => assignSubParcelToPositions(cellId, cellSubParcelId, positions),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(cellId) });
        },
    });
}

/**
 * Fill an entire row with a sub-parcel
 */
export function useFillRowWithSubParcel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            cellId,
            cellSubParcelId,
            rowIndex,
            stackCount,
            cell,
        }: {
            cellId: string;
            cellSubParcelId: string;
            rowIndex: number;
            stackCount: number;
            cell: StorageCell;
        }) => fillRowWithSubParcel(cellId, cell, rowIndex, cellSubParcelId),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(cellId) });
        },
    });
}

/**
 * Fill an entire column with a sub-parcel
 */
export function useFillColumnWithSubParcel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            cellId,
            cellSubParcelId,
            colIndex,
            stackCount,
            cell,
        }: {
            cellId: string;
            cellSubParcelId: string;
            colIndex: number;
            stackCount: number;
            cell: StorageCell;
        }) => fillColumnWithSubParcel(cellId, cell, colIndex, cellSubParcelId),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(cellId) });
        },
    });
}

/**
 * Fill all empty positions with a sub-parcel
 */
export function useFillAllEmptyPositions() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            cellId,
            cellSubParcelId,
            stackCount,
            cell,
        }: {
            cellId: string;
            cellSubParcelId: string;
            stackCount: number;
            cell: StorageCell;
        }) => fillAllEmptyPositions(cellId, cell, cellSubParcelId),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.positionContents(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.positionStacks(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.storageCell(cellId) });
        },
    });
}

// ============================================
// Harvest Registration Hooks (migration 009)
// ============================================

/**
 * Fetch all harvest registrations with computed storage totals
 */
export function useHarvestRegistrations(options?: {
    season?: string;
    subParcelId?: string;
    fromDate?: Date;
    toDate?: Date;
}) {
    const queryKey = options?.season
        ? queryKeys.harvestRegistrationsBySeason(options.season)
        : queryKeys.harvestRegistrations;

    return useQuery({
        queryKey,
        queryFn: () => getHarvestRegistrations(options),
        staleTime: 30 * 1000, // 30 seconds
    });
}

/**
 * Fetch harvests for a specific date
 */
export function useHarvestsForDate(date: Date) {
    const dateStr = date.toISOString().split('T')[0];

    return useQuery({
        queryKey: queryKeys.harvestRegistrationsByDate(dateStr),
        queryFn: () => getHarvestsForDate(date),
        staleTime: 30 * 1000,
    });
}

/**
 * Fetch available harvests for storage (with remaining crates)
 */
export function useAvailableHarvestsForStorage(options?: {
    variety?: string;
    subParcelId?: string;
}) {
    return useQuery({
        queryKey: queryKeys.availableHarvestsForStorage,
        queryFn: () => getAvailableHarvestsForStorage(options),
        staleTime: 30 * 1000,
    });
}

/**
 * Fetch distinct seasons for filtering
 */
export function useHarvestSeasons() {
    return useQuery({
        queryKey: queryKeys.harvestSeasons,
        queryFn: getHarvestSeasons,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Create a new harvest registration
 */
export function useCreateHarvestRegistration() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: HarvestRegistrationInput) => createHarvestRegistration(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.harvestRegistrations });
            queryClient.invalidateQueries({ queryKey: queryKeys.availableHarvestsForStorage });
            queryClient.invalidateQueries({ queryKey: queryKeys.harvestSeasons });
        },
    });
}

/**
 * Update a harvest registration
 */
export function useUpdateHarvestRegistration() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            updates,
        }: {
            id: string;
            updates: Partial<HarvestRegistrationInput>;
        }) => updateHarvestRegistration(id, updates),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.harvestRegistrations });
            queryClient.invalidateQueries({ queryKey: queryKeys.harvestRegistration(id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.availableHarvestsForStorage });
        },
    });
}

/**
 * Delete a harvest registration
 */
export function useDeleteHarvestRegistration() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteHarvestRegistration(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.harvestRegistrations });
            queryClient.invalidateQueries({ queryKey: queryKeys.availableHarvestsForStorage });
            queryClient.invalidateQueries({ queryKey: queryKeys.harvestSeasons });
        },
    });
}

/**
 * Link a cell sub-parcel to a harvest registration
 */
export function useLinkCellSubParcelToHarvest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            cellSubParcelId,
            harvestRegistrationId,
            cellId,
        }: {
            cellSubParcelId: string;
            harvestRegistrationId: string | null;
            cellId: string;
        }) => linkCellSubParcelToHarvest(cellSubParcelId, harvestRegistrationId),
        onSuccess: (_, { cellId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.harvestRegistrations });
            queryClient.invalidateQueries({ queryKey: queryKeys.availableHarvestsForStorage });
            queryClient.invalidateQueries({ queryKey: queryKeys.cellSubParcels(cellId) });
        },
    });
}

// ============================================
// Afzetstromen Hooks (migration 057)
// ============================================

export function useBatches(options?: {
    season?: string;
    harvestYear?: number;
    status?: BatchStatus;
    search?: string;
}) {
    return useQuery({
        queryKey: options && Object.keys(options).length > 0
            ? queryKeys.batchesFiltered(options as Record<string, unknown>)
            : queryKeys.batches,
        queryFn: () => getBatches(options),
        staleTime: 30 * 1000,
    });
}

export function useBatch(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.batch(id || ''),
        queryFn: () => (id ? getBatchById(id) : null),
        enabled: !!id,
        staleTime: 30 * 1000,
    });
}

export function useBatchSeasons() {
    return useQuery({
        queryKey: queryKeys.batchSeasons,
        queryFn: getBatchSeasons,
        staleTime: 5 * 60 * 1000,
    });
}

export function useKnownVarieties() {
    return useQuery({
        queryKey: queryKeys.knownVarieties,
        queryFn: getKnownVarieties,
        staleTime: 5 * 60 * 1000,
    });
}

export function useKnownHarvestYears() {
    return useQuery({
        queryKey: queryKeys.knownHarvestYears,
        queryFn: getKnownHarvestYears,
        staleTime: 5 * 60 * 1000,
    });
}

// ----- batch_parcels (m:m partij ↔ (sub)perceel) -----

export function useBatchParcels(batchId: string | null | undefined) {
    return useQuery<BatchParcelLink[]>({
        queryKey: queryKeys.batchParcels(batchId ?? ''),
        queryFn: () => getBatchParcels(batchId as string),
        enabled: !!batchId,
        staleTime: 30 * 1000,
    });
}

export function useAddBatchParcels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            batchId,
            items,
        }: {
            batchId: string;
            items: BatchParcelLinkInput[];
        }) => addBatchParcels(batchId, items),
        onSuccess: (_, { batchId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchParcels(batchId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.batch(batchId) });
        },
    });
}

export function useUpdateBatchParcel() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            batchId,
            updates,
        }: {
            id: string;
            batchId: string;
            updates: Partial<BatchParcelLinkInput>;
        }) => updateBatchParcel(id, updates),
        onSuccess: (_, { batchId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchParcels(batchId) });
        },
    });
}

export function useDeleteBatchParcel() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; batchId: string }) => deleteBatchParcel(id),
        onSuccess: (_, { batchId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchParcels(batchId) });
        },
    });
}

// ----- Sorteerrapport upload + AI-extractie → batch in één stap -----

export interface ExtractSorteerrapportResult {
    batchId: string;
    label: string | null;
    matchedParcel: {
        parcelId: string;
        subParcelId: string | null;
        parcelName: string;
        subParcelName: string | null;
    } | null;
    confidence: number;
    sizesFound: number;
    totalKg: number | null;
    totalRevenueEur: number | null;
    sortCostEur: number | null;
    extraction: unknown;
}

export function useExtractSorteerrapport() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/afzetstromen/extract-sorteerrapport', {
                method: 'POST',
                body: formData,
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'AI-extractie mislukt');
            return json.data as ExtractSorteerrapportResult;
        },
        onSuccess: (result) => {
            // Nieuwe partij + events + koppeling → invalideer alles rond batches
            queryClient.invalidateQueries({ queryKey: ['batches'], refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: queryKeys.batchSeasons });
            queryClient.invalidateQueries({ queryKey: queryKeys.knownVarieties });
            queryClient.invalidateQueries({ queryKey: queryKeys.knownHarvestYears });
            queryClient.invalidateQueries({ queryKey: queryKeys.batchEvents(result.batchId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.batchParcels(result.batchId) });
            queryClient.invalidateQueries({
                queryKey: queryKeys.batchDocuments(result.batchId),
            });
        },
    });
}

export function useCreateBatch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: BatchInput) => createBatch(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batches });
            queryClient.invalidateQueries({ queryKey: queryKeys.batchSeasons });
        },
    });
}

export function useUpdateBatch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<BatchInput> }) =>
            updateBatch(id, updates),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batches });
            queryClient.invalidateQueries({ queryKey: queryKeys.batch(id) });
        },
    });
}

export function useDeleteBatch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteBatch(id),
        onSuccess: (_, id) => {
            // Remove from all cached batch lists immediately (covers filtered variants too)
            queryClient.setQueriesData<Batch[] | undefined>(
                { queryKey: ['batches'] },
                (old) => {
                    if (!Array.isArray(old)) return old;
                    return old.filter((b) => b.id !== id);
                }
            );
            // Drop the single-batch cache entry
            queryClient.removeQueries({ queryKey: queryKeys.batch(id) });
            // Force refetch of any active list queries
            queryClient.invalidateQueries({ queryKey: ['batches'], refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: queryKeys.batchSeasons });
            queryClient.invalidateQueries({ queryKey: queryKeys.knownVarieties });
            queryClient.invalidateQueries({ queryKey: queryKeys.knownHarvestYears });
        },
    });
}

export function useBatchEvents(batchId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.batchEvents(batchId || ''),
        queryFn: () => (batchId ? getBatchEvents(batchId) : Promise.resolve([])),
        enabled: !!batchId,
        staleTime: 30 * 1000,
    });
}

export function useBatchEventsByType(
    type: BatchEventType,
    options?: { season?: string; harvestYear?: number }
) {
    return useQuery({
        queryKey: queryKeys.batchEventsByType(type, options as Record<string, unknown> | undefined),
        queryFn: () => getBatchEventsByType(type, options),
        staleTime: 30 * 1000,
    });
}

export function useCreateBatchEvent() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: BatchEventInput) => createBatchEvent(input),
        onSuccess: (_, input) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchEvents(input.batchId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.batches });
            queryClient.invalidateQueries({ queryKey: queryKeys.batch(input.batchId) });
            queryClient.invalidateQueries({ queryKey: ['batch-events', 'type'] });
        },
    });
}

export function useUpdateBatchEvent() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            batchId,
            updates,
        }: {
            id: string;
            batchId: string;
            updates: Partial<Omit<BatchEventInput, 'batchId'>>;
        }) => updateBatchEvent(id, updates),
        onSuccess: (_, { batchId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchEvents(batchId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.batches });
            queryClient.invalidateQueries({ queryKey: queryKeys.batch(batchId) });
            queryClient.invalidateQueries({ queryKey: ['batch-events', 'type'] });
        },
    });
}

export function useDeleteBatchEvent() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, batchId }: { id: string; batchId: string }) => deleteBatchEvent(id),
        onSuccess: (_, { batchId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchEvents(batchId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.batches });
            queryClient.invalidateQueries({ queryKey: queryKeys.batch(batchId) });
            queryClient.invalidateQueries({ queryKey: ['batch-events', 'type'] });
        },
    });
}

export function useBatchDocuments(options?: { batchId?: string | null; onlyInbox?: boolean }) {
    const key = options?.onlyInbox
        ? queryKeys.batchDocumentsInbox
        : queryKeys.batchDocuments(options?.batchId ?? null);
    return useQuery({
        queryKey: key,
        queryFn: () => getBatchDocuments(options),
        staleTime: 30 * 1000,
    });
}

export function useUploadBatchDocument() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (params: {
            file: File;
            batchId?: string | null;
            documentType?: BatchDocumentInput['documentType'];
            notes?: string | null;
        }) => {
            const formData = new FormData();
            formData.append('file', params.file);
            if (params.batchId) formData.append('batchId', params.batchId);
            if (params.documentType) formData.append('documentType', params.documentType);
            if (params.notes) formData.append('notes', params.notes);
            const res = await fetch('/api/afzetstromen/documents/upload', {
                method: 'POST',
                body: formData,
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Upload mislukt');
            return json.data as BatchDocument;
        },
        onSuccess: (_, params) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchDocuments(params.batchId ?? null) });
            queryClient.invalidateQueries({ queryKey: queryKeys.batchDocumentsInbox });
        },
    });
}

export function useUpdateBatchDocument() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<BatchDocumentInput> }) =>
            updateBatchDocument(id, updates),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchDocumentsInbox });
            if (data.batchId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.batchDocuments(data.batchId) });
            }
        },
    });
}

export function useDeleteBatchDocument() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteBatchDocument(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.batchDocumentsInbox });
            queryClient.invalidateQueries({ queryKey: ['batch-documents'] });
        },
    });
}

export function useBatchDocumentDownload() {
    return useMutation({
        mutationFn: (storagePath: string) => getBatchDocumentSignedUrl(storagePath),
    });
}

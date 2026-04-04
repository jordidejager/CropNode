'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { getSprayableParcels } from '@/lib/supabase-store';

export function QueryProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000,
                        gcTime: 30 * 60 * 1000,
                        retry: 2,
                        refetchOnWindowFocus: false,
                        refetchOnReconnect: true,
                        refetchOnMount: false,
                    },
                },
            })
    );

    // Prefetch commonly needed data on app mount
    useEffect(() => {
        queryClient.prefetchQuery({
            queryKey: ['sprayable-parcels'],
            queryFn: () => getSprayableParcels(),
            staleTime: 10 * 60 * 1000, // 10 min
        });
    }, [queryClient]);

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

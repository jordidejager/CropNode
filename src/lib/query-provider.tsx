'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Stale time: data is considered fresh for 1 minute
                        // This means cached data is shown immediately while refetching in background
                        staleTime: 60 * 1000, // 1 minute
                        // Cache time: data stays in cache for 30 minutes
                        gcTime: 30 * 60 * 1000,
                        // Retry failed requests 2 times
                        retry: 2,
                        // Don't refetch on window focus (prevents jarring updates)
                        refetchOnWindowFocus: false,
                        // Refetch on reconnect for fresh data after offline
                        refetchOnReconnect: true,
                        // Don't refetch on mount if data is still fresh
                        refetchOnMount: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

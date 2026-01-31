'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSupabase } from './provider';
import { RealtimeChannel } from '@supabase/supabase-js';

export type UseSupabaseRowOptions = {
  deps?: any[];
  realtime?: boolean;
  realtimeTable?: string;
};

/**
 * A hook that returns a single row from Supabase.
 * Equivalent to useDoc for Firestore.
 *
 * @example
 * ```tsx
 * import { useSupabaseRow } from '@/lib/supabase';
 *
 * function ParcelComponent({ id }: { id: string }) {
 *   const { data, loading, error } = useSupabaseRow<Parcel>(
 *     (supabase) => supabase.from('parcels').select('*').eq('id', id).single(),
 *     { deps: [id] }
 *   );
 *
 *   if (loading) return <p>Loading...</p>;
 *   if (error) return <p>Error: {error.message}</p>;
 *
 *   return <h1>{data?.name}</h1>;
 * }
 * ```
 */
export function useSupabaseRow<T>(
  queryFactory: (supabase: ReturnType<typeof useSupabase>) => PromiseLike<{ data: T | null; error: any }>,
  options?: UseSupabaseRowOptions
) {
  const supabase = useSupabase();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const queryRef = useRef(queryFactory);
  queryRef.current = queryFactory;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const result = await queryRef.current(supabase);
      if (result.error) {
        setError(new Error(result.error.message));
      } else {
        setData(result.data || undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();

    // Set up realtime subscription if enabled
    let channel: RealtimeChannel | null = null;
    if (options?.realtime && options?.realtimeTable) {
      channel = supabase
        .channel(`${options.realtimeTable}-row-changes`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: options.realtimeTable },
          () => {
            fetchData();
          }
        )
        .subscribe();
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase, fetchData, ...(options?.deps ?? [])]);

  return { data, loading, error, refetch: fetchData };
}

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSupabase } from './provider';
import { RealtimeChannel } from '@supabase/supabase-js';

export type UseSupabaseQueryOptions<T> = {
  deps?: any[];
  realtime?: boolean;
  realtimeTable?: string;
};

/**
 * A hook that returns a collection of rows from Supabase.
 * Equivalent to useCollection for Firestore.
 *
 * @example
 * ```tsx
 * import { useSupabaseQuery } from '@/lib/supabase';
 *
 * function ParcelsComponent() {
 *   const { data, loading, error, refetch } = useSupabaseQuery<Parcel>(
 *     (supabase) => supabase.from('parcels').select('*').order('name'),
 *     { deps: [] }
 *   );
 *
 *   if (loading) return <p>Loading...</p>;
 *   if (error) return <p>Error: {error.message}</p>;
 *
 *   return (
 *     <ul>
 *       {data?.map((parcel) => (
 *         <li key={parcel.id}>{parcel.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useSupabaseQuery<T>(
  queryFactory: (supabase: ReturnType<typeof useSupabase>) => PromiseLike<{ data: T[] | null; error: any }>,
  options?: UseSupabaseQueryOptions<T>
) {
  const supabase = useSupabase();
  const [data, setData] = useState<T[]>();
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
        setData(result.data || []);
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
        .channel(`${options.realtimeTable}-changes`)
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

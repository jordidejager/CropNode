'use client';
import {
  Firestore,
  onSnapshot,
  DocumentReference,
  DocumentSnapshot,
} from 'firebase/firestore';
import { useEffect, useState, useRef } from 'react';
import { useFirestore } from '..';

export type UseDocOptions = {
  deps?: any[];
};

/**
 * A hook that returns a single document from Firestore.
 *
 * Note: This hook will not work with server-side rendering.
 *
 * @example
 * ```tsx
 * import { useDoc } from '@/firebase';
 * import { doc } from 'firebase/firestore';
 *
 * function RecipeComponent({ id }: { id: string }) {
 *   const { data, loading, error } = useDoc<Recipe>(
 *     (db) => doc(db, 'recipes', id),
 *     {
 *       deps: [id],
 *     }
 *   );
 *
 *   if (loading) {
 *     return <p>Loading recipe...</p>;
 *   }
 *
 *   if (error) {
 *     return <p>Error: {error.message}</p>;
 *   }
 *
 *   return <h1>{data.name}</h1>;
 * }
 * ```
 */
export function useDoc<T>(
  docRefFactory: (db: Firestore) => DocumentReference | null,
  options?: UseDocOptions
) {
  const db = useFirestore();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const docRefCurrent = useRef(docRefFactory);
  docRefCurrent.current = docRefFactory;

  useEffect(() => {
    if (!db) {
      return;
    }

    setLoading(true);
    setError(undefined);

    const docRef = docRefCurrent.current(db);
    if (!docRef) {
      setData(undefined);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot: DocumentSnapshot) => {
        if (!snapshot.exists()) {
          setData(undefined);
          setLoading(false);
          return;
        }

        const data = {
          id: snapshot.id,
          ...snapshot.data(),
        } as T;
        setData(data);
        setLoading(false);
      },
      (err: Error) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, ...(options?.deps ?? [])]);

  return { data, loading, error };
}

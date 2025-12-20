'use client';
import {
  Firestore,
  onSnapshot,
  Query,
  QuerySnapshot,
} from 'firebase/firestore';
import { useEffect, useState, useRef } from 'react';
import { useFirestore } from '..';

export type UseCollectionOptions = {
  deps?: any[];
};

/**
 * A hook that returns a collection of documents from Firestore.
 *
 * Note: This hook will not work with server-side rendering.
 *
 * @example
 * ```tsx
 * import { useCollection } from '@/firebase';
 * import { collection } from 'firebase/firestore';
 *
 * function RecipesComponent() {
 *   const { data, loading, error } = useCollection<Recipe>(
 *     (db) => collection(db, 'recipes'),
 *     {
 *       deps: [],
 *     }
 *   );
 *
 *   if (loading) {
 *     return <p>Loading recipes...</p>;
 *   }
 *
 *   if (error) {
 *     return <p>Error: {error.message}</p>;
 *   }
 *
 *   return (
 *     <ul>
 *       {data.map((recipe) => (
 *         <li key={recipe.id}>{recipe.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useCollection<T>(
  queryFactory: (db: Firestore) => Query | null,
  options?: UseCollectionOptions
) {
  const db = useFirestore();
  const [data, setData] = useState<T[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const queryRef = useRef(queryFactory);
  queryRef.current = queryFactory;

  useEffect(() => {
    if (!db) {
      return;
    }

    setLoading(true);
    setError(undefined);

    const query = queryRef.current(db);
    if (!query) {
      setData([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      query,
      (snapshot: QuerySnapshot) => {
        const data = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as T)
        );
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

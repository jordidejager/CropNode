'use client';
import { Auth, onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useAuth } from '../';

/**
 * A hook that returns the currently logged in user.
 *
 * @example
 * ```tsx
 * import { useUser } from '@/firebase';
 *
 * function UserComponent() {
 *   const user = useUser();
 *
 *   return (
 *     <div>
 *       {user ? <p>Welcome, {user.displayName}</p> : <p>Please sign in</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export const useUser = (): User | null | undefined => {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>();

  useEffect(() => {
    if (!auth) {
      setUser(undefined);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, [auth]);

  return user;
};

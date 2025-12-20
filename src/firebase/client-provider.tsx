'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';

import { initializeFirebase, FirebaseProvider } from '.';

type FirebaseContextType = {
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
};

const FirebaseContext = createContext<FirebaseContextType>({
  app: null,
  auth: null,
  firestore: null,
});

/**
 * Provider that will ensure that Firebase is only initialized once on the client.
 *
 * The provider can be used like this:
 *
 * ```tsx
 * import FirebaseProvider from '@/firebase/client-provider';
 *
 * export default function RootLayout({
 *   children,
 * }: Readonly<{
 *   children: React.ReactNode;
 * }>) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <FirebaseProvider>
 *           {children}
 *         </FirebaseProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export default function FirebaseProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const [firebase, setFirebase] = useState<FirebaseContextType | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFirebase(initializeFirebase());
    }
  }, []);

  if (!firebase) {
    return null;
  }

  return (
    <FirebaseProvider
      app={firebase.app!}
      auth={firebase.auth!}
      firestore={firebase.firestore!}
    >
      {children}
    </FirebaseProvider>
  );
}

export const useFirebase = () => useContext(FirebaseContext);

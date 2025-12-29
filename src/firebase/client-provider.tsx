
'use client';

import {
  ReactNode,
  useEffect,
  useState,
} from 'react';

import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';
import { FirebaseStorage } from 'firebase/storage';

import { initializeFirebase, FirebaseProvider } from '.';

type FirebaseContextType = {
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
  storage: FirebaseStorage | null;
};

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
      storage={firebase.storage!}
    >
      {children}
    </FirebaseProvider>
  );
}

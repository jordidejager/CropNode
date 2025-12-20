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
import { initializeFirebase } from '.';

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
export function FirebaseProvider({
  children,
  app,
  auth,
  firestore,
}: {
  children: ReactNode;
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}) {
  return (
    <FirebaseContext.Provider value={{ app, auth, firestore }}>
      {children}
    </FirebaseContext.Provider>
  );
}

/**
 * Returns the raw Firebase context. This is not recommended for use in components,
 * instead use the {@link useFirebaseApp}, {@link useAuth}, and {@link useFirestore} hooks.
 *
 * @returns The raw Firebase context.
 */
export const useFirebase = () => useContext(FirebaseContext);

/**
 * Returns the Firebase app instance.
 *
 * This hook can be used to access the Firebase app instance directly, but it is
 * recommended to use the {@link useAuth} and {@link useFirestore} hooks instead.
 *
 * Note: This hook will not work with server-side rendering.
 *
 * @returns The Firebase app instance.
 *
 * @example
 * ```tsx
 * import { useFirebaseApp } from '@/firebase';
 *
 * function AppComponent() {
 *  const app = useFirebaseApp();
 *
 *  return <p>App name: {app.name}</p>;
 * }
 * ```
 */
export const useFirebaseApp = () => useFirebase()?.app;

/**
 * Returns the Firebase auth instance.
 *
 * This hook is the recommended way to access the Firebase auth instance.
 *
 * Note: This hook will not work with server-side rendering.
 *
 * @returns The Firebase auth instance.
 *
 * @example
 * ```tsx
 * import { useAuth } from '@/firebase';
 * import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
 *
 * function SignInButton() {
 *   const auth = useAuth();
 *
 *   const handleSignIn = async () => {
 *     const provider = new GoogleAuthProvider();
 *     await signInWithPopup(auth, provider);
 *   };
 *
 *   return <button onClick={handleSignIn}>Sign in with Google</button>;
 * }
 * ```
 */
export const useAuth = () => useFirebase()?.auth;

/**
 * Returns the Firebase firestore instance.
 *
 * This hook is the recommended way to access the Firebase firestore instance.
 *
 * Note: This hook will not work with server-side rendering.
 *
 * @returns The Firebase firestore instance.
 *
 * @example
 * ```tsx
 * import { useFirestore } from '@/firebase';
 * import { collection } from 'firebase/firestore';
 *
 * function RecipesComponent() {
 *   const db = useFirestore();
 *   const recipesCollection = collection(db, 'recipes');
 *
 *   // ...
 * }
 * ```
 */
export const useFirestore = () => useFirebase()?.firestore;

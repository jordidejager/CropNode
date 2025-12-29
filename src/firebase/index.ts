
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

import { firebaseConfig } from './config';

/**
 * Initializes the Firebase app, returning the app, auth, and firestore instances.
 * This function will only initialize the app once, and is safe to call multiple times.
 *
 * Note: This function should not be used in client components. Instead, use the
 * {@link useFirebaseApp}, {@link useAuth}, and {@link useFirestore} hooks.
 *
 * @returns An object containing the Firebase app, auth, firestore and storage instances.
 *
 * @example
 * ```ts
 * import { initializeFirebase } from '@/firebase';
 *
 * const { app, auth, firestore, storage } = initializeFirebase();
 * ```
 */
export function initializeFirebase() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const storage = getStorage(app);

  return { app, auth, firestore, storage };
}

export { FirebaseProvider } from './provider';
export {
  useFirebaseApp,
  useAuth,
  useFirestore,
  useStorage,
  useFirebase,
} from './provider';
export { useUser } from './auth/use-user';
export { useCollection } from './firestore/use-collection';
export { useDoc } from './firestore/use-doc';


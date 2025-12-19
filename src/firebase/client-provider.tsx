'use client';

import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { app, db } from './client';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';

interface FirebaseContextType {
  app: FirebaseApp | null;
  db: Firestore | null;
}

const FirebaseContext = createContext<FirebaseContextType>({ app: null, db: null });

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [firebase, setFirebase] = useState<FirebaseContextType>({ app, db });

  // This is a bit of a trick to make sure the firebase object is available on the client side
  // but doesn't cause hydration issues.
  useEffect(() => {
    if (!firebase.app || !firebase.db) {
      setFirebase({ app, db });
    }
  }, [firebase]);

  return (
    <FirebaseContext.Provider value={firebase}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

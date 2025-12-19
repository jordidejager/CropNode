'use client';

import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import React, { ReactNode, createContext, useContext } from 'react';
import { app, db } from './client';

interface FirebaseContextType {
  app: FirebaseApp | null;
  db: Firestore | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  app: null,
  db: null,
});

export function FirebaseProvider({ children }: { children: ReactNode }) {
  // This is a bit of a trick to make sure the firebase object is available on the client side
  // but doesn't cause hydration issues.
  let firebaseApp: FirebaseApp;
  let firestore: Firestore;

  if (typeof window !== 'undefined') {
    firebaseApp = app;
    firestore = db;
  }

  return (
    <FirebaseContext.Provider value={{ app: firebaseApp!, db: firestore! }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

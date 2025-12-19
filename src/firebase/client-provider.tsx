'use client';

import { ReactNode, createContext, useContext } from 'react';
import { app, db } from './client';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';

interface FirebaseContextType {
  app: FirebaseApp;
  db: Firestore;
}

const FirebaseContext = createContext<FirebaseContextType | null>(null);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  return (
    <FirebaseContext.Provider value={{ app, db }}>
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

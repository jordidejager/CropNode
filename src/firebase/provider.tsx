'use client';

import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import { ReactNode, createContext, useContext } from 'react';

interface FirebaseContextType {
  app: FirebaseApp | null;
  db: Firestore | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  app: null,
  db: null,
});

export default function FirebaseProvider({
  children,
  app,
  db,
}: {
  children: ReactNode;
  app: FirebaseApp;
  db: Firestore;
}) {
  return (
    <FirebaseContext.Provider value={{ app, db }}>
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

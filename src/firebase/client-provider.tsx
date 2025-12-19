'use client';

import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import React, { ReactNode } from 'react';
import { app, db } from './client';
import FirebaseProvider from './provider';

// This is a bit of a trick to make sure the firebase object is available on the client side
// but doesn't cause hydration issues.
let firebaseApp: FirebaseApp;
let firestore: Firestore;

if (typeof window !== 'undefined') {
  firebaseApp = app;
  firestore = db;
}

export default function ClientFirebaseProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <FirebaseProvider app={firebaseApp} db={firestore}>
      {children}
    </FirebaseProvider>
  );
}

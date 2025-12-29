import * as admin from 'firebase-admin';
import { firebaseConfig } from './config';

// Ensure the app is only initialized once
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: firebaseConfig.storageBucket
    });
  } catch (error: any) {
    console.error('Firebase Admin Initialization Error:', error);
    // If running locally without default credentials, you might need a service account file
    if (error.code === 'GOOGLE_APPLICATION_CREDENTIALS_NOT_SET') {
        console.warn(
            "GOOGLE_APPLICATION_CREDENTIALS_NOT_SET. " +
            "For local development, you may need to set up a service account. " +
            "See https://firebase.google.com/docs/admin/setup#initialize-sdk"
        );
    }
  }
}

export const adminDb = admin.firestore();
export const adminStorage = admin.storage();

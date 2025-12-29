

'use server';

import { initializeFirebase } from '@/firebase';
import { getMiddelen, getUploadLogs, getCtgbMiddelen } from '@/lib/store';
import { MiddelMatrixClientPage } from './client-page';

export default async function MiddelMatrixPage() {
    const { firestore } = initializeFirebase();
    const [middelen, uploadLogs, ctgbData] = await Promise.all([
        getMiddelen(firestore),
        getUploadLogs(firestore),
        getCtgbMiddelen(firestore) // Fetch from Firestore instead of API
    ]);

    return <MiddelMatrixClientPage 
        initialData={middelen} 
        initialLogs={uploadLogs}
        initialCtgbData={ctgbData}
    />;
}

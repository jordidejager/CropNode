'use server';

import { initializeFirebase } from '@/firebase';
import { getMiddelen, getUploadLogs } from '@/lib/store';
import { MiddelMatrixClientPage } from './client-page';

export default async function MiddelMatrixPage() {
    const { firestore } = initializeFirebase();
    const [middelen, uploadLogs] = await Promise.all([
        getMiddelen(firestore),
        getUploadLogs(firestore),
    ]);

    return <MiddelMatrixClientPage 
        initialData={middelen} 
        initialLogs={uploadLogs}
    />;
}

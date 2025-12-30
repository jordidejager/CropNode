'use server';

import { initializeFirebase } from '@/firebase';
import { getMiddelen, getUploadLogs } from '@/lib/store';
import { MiddelMatrixClientPage } from './client-page';

export default async function MiddelMatrixPage() {
    const { firestore } = initializeFirebase();
    
    // We fetch the data on the server and pass it to the client component.
    const [middelen, uploadLogs] = await Promise.all([
        getMiddelen(firestore),
        getUploadLogs(firestore),
    ]);

    return <MiddelMatrixClientPage 
        initialData={middelen} 
        initialLogs={uploadLogs}
    />;
}

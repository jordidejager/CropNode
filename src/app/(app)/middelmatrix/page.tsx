

'use server';

import { initializeFirebase } from '@/firebase';
import { getMiddelen, getUploadLogs } from '@/lib/store';
import { MiddelMatrixClientPage } from './client-page';
import { getCtgbData } from '@/lib/ctgb-api';

export default async function MiddelMatrixPage() {
    const { firestore } = initializeFirebase();
    const [middelen, uploadLogs, ctgbData] = await Promise.all([
        getMiddelen(firestore),
        getUploadLogs(firestore),
        getCtgbData()
    ]);

    return <MiddelMatrixClientPage 
        initialData={middelen} 
        initialLogs={uploadLogs}
        initialCtgbData={ctgbData}
    />;
}

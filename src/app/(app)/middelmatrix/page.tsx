
'use server';

import { initializeFirebase } from '@/firebase';
import { getMiddelen } from '@/lib/store';
import { MiddelMatrixClientPage } from './client-page';

export default async function MiddelMatrixPage() {
    const { firestore } = initializeFirebase();
    
    // We fetch the data on the server and pass it to the client component.
    const middelen = await getMiddelen(firestore);

    return <MiddelMatrixClientPage 
        initialData={middelen} 
    />;
}


'use server';

import { initializeFirebase } from '@/firebase';
import { getSpuitschriftEntries, getParcels } from '@/lib/store';
import { SpuitschriftClientPage } from './client-page';
import { SpuitschriftEntry, Parcel } from '@/lib/types';

export default async function SpuitschriftPage() {
    const { firestore } = initializeFirebase();
    
    const [entries, allParcels] = await Promise.all([
        getSpuitschriftEntries(firestore),
        getParcels(firestore)
    ]);

    return <SpuitschriftClientPage 
        initialEntries={entries} 
        allParcels={allParcels}
    />;
}

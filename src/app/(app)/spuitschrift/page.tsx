'use server';

import { initializeFirebase } from '@/firebase';
import { getLogbookEntries, getParcels } from '@/lib/store';
import { SpuitschriftClientPage } from './client-page';
import { LogbookEntry, Parcel } from '@/lib/types';

export default async function SpuitschriftPage() {
    const { firestore } = initializeFirebase();
    
    const allEntries: LogbookEntry[] = await getLogbookEntries(firestore);
    const allParcels: Parcel[] = await getParcels(firestore);

    // Filter for confirmed entries on the server
    const confirmedEntries = allEntries.filter(entry => entry.status === 'Akkoord');

    return <SpuitschriftClientPage 
        initialEntries={confirmedEntries} 
        allParcels={allParcels}
    />;
}

import { getParcelHistoryEntries, getParcels } from './supabase-store';

async function main() {
    const parcels = await getParcels();
    console.log('Parcels:', parcels.map(p => ({ id: p.id, name: p.name, crop: p.crop })));

    const history = await getParcelHistoryEntries();
    console.log('Recent History:', history.slice(0, 5).map(h => ({ parcel: h.parcelName, product: h.product, date: h.date })));
}

main().catch(console.error);

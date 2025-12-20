import type { Middel } from './types';

// The parcels data is now fetched from Firestore.
// This file can be used for other static data if needed.

export const middelMatrix: Middel[] = [
  { product: 'Captan', crop: 'Peer', disease: 'Schurft', maxDosage: 1.5, unit: 'kg' },
  { product: 'Captan', crop: 'Appel', disease: 'Schurft', maxDosage: 1.8, unit: 'kg' },
  { product: 'Regalis Plus', crop: 'Appel', maxDosage: 1.25, unit: 'kg' },
  { product: 'Regalis Plus', crop: 'Peer', maxDosage: 1.0, unit: 'kg' },
  { product: 'Ureum', crop: 'Peer', maxDosage: 5.0, unit: 'kg' },
  { product: 'Ureum', crop: 'Appel', maxDosage: 5.0, unit: 'kg' },
  { product: 'Zwavel', crop: 'Appel', disease: 'Meeldauw', maxDosage: 7.5, unit: 'kg' },
  { product: 'Koper', crop: 'Appel', disease: 'Kanker', maxDosage: 0.5, unit: 'l' },
];

export const products: string[] = ['Captan', 'Regalis Plus', 'Zwavel', 'Koper', 'Ureum'];

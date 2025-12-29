
import type { Middel } from './types';

// The parcels data is now fetched from Firestore.
// This file can be used for other static data if needed.

// This is now just for seeding the DB if needed, or for static fallback.
export const middelMatrix: Middel[] = [
  { id: '1', product: 'Captan', crop: 'Peer', disease: 'Schurft', maxDosage: 1.5, unit: 'kg', safetyPeriodDays: 21, maxApplicationsPerYear: 8, maxDosePerYear: 12, minIntervalDays: 7 },
  { id: '2', product: 'Captan', crop: 'Appel', disease: 'Schurft', maxDosage: 1.8, unit: 'kg', safetyPeriodDays: 21, maxApplicationsPerYear: 8, maxDosePerYear: 14.4, minIntervalDays: 7 },
  { id: '3', product: 'Regalis Plus', crop: 'Appel', maxDosage: 1.25, unit: 'kg', safetyPeriodDays: 45, maxApplicationsPerYear: 2, maxDosePerYear: 2.5, minIntervalDays: 21 },
  { id: '4', product: 'Regalis Plus', crop: 'Peer', maxDosage: 1.0, unit: 'kg', safetyPeriodDays: 45, maxApplicationsPerYear: 2, maxDosePerYear: 2.0, minIntervalDays: 21 },
  { id: '5', product: 'Ureum', crop: 'Peer', maxDosage: 5.0, unit: 'kg', safetyPeriodDays: 0, maxApplicationsPerYear: 10, maxDosePerYear: 50, minIntervalDays: 5 },
  { id: '6', product: 'Ureum', crop: 'Appel', maxDosage: 5.0, unit: 'kg', safetyPeriodDays: 0, maxApplicationsPerYear: 10, maxDosePerYear: 50, minIntervalDays: 5 },
  { id: '7', product: 'Zwavel', crop: 'Appel', disease: 'Meeldauw', maxDosage: 7.5, unit: 'kg', safetyPeriodDays: 5, maxApplicationsPerYear: 8, maxDosePerYear: 60, minIntervalDays: 7 },
  { id: '8', product: 'Koper', crop: 'Appel', disease: 'Kanker', maxDosage: 0.5, unit: 'l', safetyPeriodDays: 21, maxApplicationsPerYear: 4, maxDosePerYear: 2, minIntervalDays: 10 },
];

export const products: string[] = ['Captan', 'Regalis Plus', 'Zwavel', 'Koper', 'Ureum'];

export const appleVarieties: string[] = ['Elstar', 'Jonagold', 'Jonagored', 'Golden Delicious', 'Gala', 'Fuji', 'Kanzi', 'Red Prince', 'Tessa'];
export const pearVarieties: string[] = ['Conference', 'Doyenné du Comice', 'Beurré Alexander Lucas', 'Triomphe de Vienne', 'Saint Rémy'];

    
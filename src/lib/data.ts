import type { Parcel, Middel } from './types';

export const parcels: Parcel[] = [
  { id: 'P-1001', name: 'Thuis peer', crop: 'Peer', variety: 'Conference', area: 1.2 },
  { id: 'P-1002', name: 'Achter huis', crop: 'Appel', variety: 'Elstar', area: 0.8 },
  { id: 'P-1003', name: 'Conference blok 1', crop: 'Peer', variety: 'Conference', area: 2.5 },
  { id: 'P-1004', name: 'Conference blok 2', crop: 'Peer', variety: 'Conference', area: 2.3 },
  { id: 'P-1005', name: 'Tessa hoek', crop: 'Appel', variety: 'Tessa', area: 0.5 },
  { id: 'P-1006', name: 'Conference nieuw', crop: 'Peer', variety: 'Conference', area: 1.8 },
  { id: 'P-1007', name: 'Conference oud', crop: 'Peer', variety: 'Conference', area: 1.9 },
  { id: 'P-1008', name: 'Conference pad', crop: 'Peer', variety: 'Conference', area: 0.9 },
  { id: 'P-1009', name: 'Conference sloot', crop: 'Peer', variety: 'Conference', area: 1.1 },
  { id: 'P-2001', name: 'Elstar jong', crop: 'Appel', variety: 'Elstar', area: 3.0 },
  { id: 'P-2002', name: 'Tessa boomgaard', crop: 'Appel', variety: 'Tessa', area: 1.5 },
];

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

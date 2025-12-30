
'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/parse-middel-voorschrift.ts';
import '@/ai/flows/parse-spray-application.ts';

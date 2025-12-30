'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/parse-spray-application.ts';
import '@/ai/flows/summarize-spray-history.ts';
import '@/ai/flows/parse-middel-voorschrift.ts';

    
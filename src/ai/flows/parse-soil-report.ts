import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SoilReportOutputSchema = z.object({
    sampleDate: z.string().optional(),
    nTotal: z.number().optional(),
    pAvailable: z.number().optional(),
    kValue: z.number().optional(),
    organicMatter: z.number().optional(),
    ph: z.number().optional(),
});

export const parseSoilReport = ai.defineFlow(
    {
        name: 'parseSoilReport',
        inputSchema: z.string(),
        outputSchema: SoilReportOutputSchema,
    },
    async (pdfText) => {
        const { output } = await ai.generate({
            prompt: `
        Je bent een expert in bodemanalyses. Extraheer de volgende waardes uit de onderstaande tekst van een Eurofins bodemrapport.
        Zoek specifiek naar:
        - Datum van bemonstering (sampleDate, formaat YYYY-MM-DD)
        - N-totaal (stikstof totaal)
        - P-beschikbaar (fosfaat beschikbaar/P-AL)
        - K-getal (kalium getal)
        - Organische stof %
        - pH-waarde
        
        Als een waarde niet gevonden kan worden, laat deze dan weg of zet op null.
        
        Tekst van rapport:
        ---
        ${pdfText}
        ---
      `,
            output: {
                schema: SoilReportOutputSchema,
            },
        });

        if (!output) throw new Error("Kon geen data extraheren");
        return output;
    }
);

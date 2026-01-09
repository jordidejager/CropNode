import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  Parcel,
  UserPreference,
  CtgbProduct,
  ProductEntry,
  ParcelHistoryEntry
} from '@/lib/types';
import {
  validateSprayApplication,
  getCurrentSeason,
  findGebruiksvoorschrift,
  type ValidationFlag,
  type ValidationResult
} from '@/lib/validation-service';

// ============================================
// Types
// ============================================

interface AnalyzeInputRequest {
  input: string;
}

interface AIProduct {
  alias: string;
  dosage: number;
  unit: string;
}

interface AIResponse {
  date: string | null;
  parcels: string[];
  products: AIProduct[];
}

interface ValidationWarning {
  type: 'error' | 'warning' | 'info' | 'parcel_not_found' | 'product_not_found' | 'dosage_exceeded' | 'product_not_allowed' | 'substance_limit' | 'interval_violation';
  message: string;
  field?: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

interface ValidatedProduct extends ProductEntry {
  originalAlias: string;
  ctgbMatch?: {
    toelatingsnummer: string;
    naam: string;
    werkzameStoffen: string[];
    maxDosering?: string;
    maxToepassingen?: number;
  };
}

interface AnalyzeInputResponse {
  success: boolean;
  data?: {
    date: string | null;
    parcels: { id: string; name: string; crop: string; variety: string }[];
    products: ValidatedProduct[];
    validationSummary: {
      isValid: boolean;
      errorCount: number;
      warningCount: number;
    };
  };
  warnings: ValidationWarning[];
  error?: string;
}

// ============================================
// Rate Limiting (In-Memory)
// ============================================

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  userLimit.count++;
  return { allowed: true };
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, limit] of rateLimitStore.entries()) {
    if (now > limit.resetTime) {
      rateLimitStore.delete(userId);
    }
  }
}, 60 * 1000);

// ============================================
// Firebase Data Fetching (Server-Side)
// CTGB Products is now the Single Source of Truth
// ============================================

async function getUserParcels(): Promise<Parcel[]> {
  try {
    const snapshot = await adminDb.collection('parcels').orderBy('name').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parcel));
  } catch (error) {
    console.error('[analyze-input] Error fetching parcels:', error);
    return [];
  }
}

async function getUserPreferences(): Promise<UserPreference[]> {
  try {
    const snapshot = await adminDb.collection('userPreferences').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserPreference));
  } catch (error) {
    console.error('[analyze-input] Error fetching user preferences:', error);
    return [];
  }
}

async function getCtgbProducts(): Promise<CtgbProduct[]> {
  try {
    const snapshot = await adminDb.collection('ctgb_products').get();
    return snapshot.docs.map(doc => doc.data() as CtgbProduct);
  } catch (error) {
    console.error('[analyze-input] Error fetching CTGB products:', error);
    return [];
  }
}

/**
 * Get parcel history for validation (seasonal cumulation check)
 */
async function getParcelSeasonHistory(
  parcelIds: string[],
  seasonStart: Date,
  seasonEnd: Date
): Promise<Map<string, ParcelHistoryEntry[]>> {
  const resultMap = new Map<string, ParcelHistoryEntry[]>();

  if (parcelIds.length === 0) return resultMap;

  // Initialize empty arrays
  for (const id of parcelIds) {
    resultMap.set(id, []);
  }

  try {
    // Firestore 'in' query is limited to 30 values
    for (let i = 0; i < parcelIds.length; i += 30) {
      const chunk = parcelIds.slice(i, i + 30);

      const snapshot = await adminDb
        .collection('parcelHistory')
        .where('parcelId', 'in', chunk)
        .where('date', '>=', Timestamp.fromDate(seasonStart))
        .where('date', '<=', Timestamp.fromDate(seasonEnd))
        .orderBy('date', 'desc')
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const parcelId = data.parcelId as string;

        let date: Date;
        if (data.date instanceof Timestamp) {
          date = data.date.toDate();
        } else if (typeof data.date === 'string') {
          date = new Date(data.date);
        } else {
          date = new Date();
        }

        const entry: ParcelHistoryEntry = {
          id: doc.id,
          logId: data.logId,
          parcelId: data.parcelId,
          parcelName: data.parcelName,
          crop: data.crop,
          variety: data.variety,
          product: data.product,
          dosage: data.dosage,
          unit: data.unit,
          date
        };

        resultMap.get(parcelId)?.push(entry);
      }
    }
  } catch (error) {
    console.error('[analyze-input] Error fetching parcel history:', error);
  }

  return resultMap;
}

// ============================================
// AI Integration (Server-Side Only)
// ============================================

async function callGeminiAPI(
  userInput: string,
  parcels: Parcel[],
  ctgbProducts: CtgbProduct[],
  userPreferences: UserPreference[]
): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is niet geconfigureerd op de server.');
  }

  // Build context for RAG
  const parcelContext = parcels.map(p =>
    `- ${p.name} (id: ${p.id}, gewas: ${p.crop}, ras: ${p.variety}, ${p.area} ha)`
  ).join('\n');

  // Use CTGB products as the source of truth for product names
  const productNames = ctgbProducts
    .filter(p => p.status === 'Valid')
    .map(p => p.naam)
    .slice(0, 300);
  const productContext = productNames.join(', ');

  const aliasContext = userPreferences.length > 0
    ? userPreferences.map(p => `"${p.alias}" -> "${p.preferred}"`).join(', ')
    : 'Geen bekende aliassen.';

  const systemPrompt = `Je bent een AI-assistent voor AgriSprayer Pro, een applicatie voor het registreren van gewasbeschermingsmiddelen.

CONTEXT - BEKENDE PERCELEN VAN DEZE GEBRUIKER:
${parcelContext || 'Geen percelen gevonden.'}

CONTEXT - TOEGELATEN GEWASBESCHERMINGSMIDDELEN (CTGB):
${productContext || 'Geen producten gevonden.'}

CONTEXT - GELEERDE ALIASSEN (gebruik deze voor matching):
${aliasContext}

INSTRUCTIES:
1. Analyseer de invoer van de gebruiker over een bespuiting.
2. Identificeer de datum (als genoemd), percelen en gebruikte middelen.
3. Voor percelen: match op naam of ras. "Alle conference" betekent alle percelen met ras "Conference".
4. Voor middelen: match de genoemde naam/alias met de CTGB producten. Gebruik de aliassen als hint.
5. Retourneer ALLEEN een geldig JSON object.

OUTPUT FORMAT (strict JSON):
{
  "date": "YYYY-MM-DD" of null als niet genoemd,
  "parcels": ["perceelnaam1", "perceelnaam2"],
  "products": [
    { "alias": "wat de gebruiker noemde", "dosage": 1.5, "unit": "l/ha" }
  ]
}

BELANGRIJK:
- Gebruik de EXACTE perceelnamen uit de context hierboven.
- Voor dosering: standaard is per hectare (l/ha of kg/ha) tenzij anders aangegeven.
- Match productnamen met officiële CTGB namen (bijv. "captan" -> "Captan 80 WDG").`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\nGEBRUIKERSINVOER:\n"${userInput}"` }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[analyze-input] Gemini API error:', errorText);
    throw new Error(`AI service fout: ${response.status}`);
  }

  const result = await response.json();
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('Geen geldige response van AI ontvangen.');
  }

  // Parse JSON from response
  let jsonStr = textContent.trim();
  if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);

  try {
    return JSON.parse(jsonStr.trim()) as AIResponse;
  } catch {
    console.error('[analyze-input] JSON parse error:', jsonStr);
    throw new Error('AI retourneerde geen geldig JSON formaat.');
  }
}

// ============================================
// Product Matching (CTGB as Single Source of Truth)
// ============================================

function fuzzyMatchCtgbProduct(
  alias: string,
  ctgbProducts: CtgbProduct[],
  userPreferences: UserPreference[]
): CtgbProduct | null {
  const normalizedAlias = alias.toLowerCase().trim();

  // 1. Check user preferences first (learned aliases)
  const preferenceMatch = userPreferences.find(p =>
    p.alias.toLowerCase() === normalizedAlias ||
    p.alias.toLowerCase().includes(normalizedAlias) ||
    normalizedAlias.includes(p.alias.toLowerCase())
  );

  if (preferenceMatch) {
    const ctgbMatch = ctgbProducts.find(c =>
      c.naam.toLowerCase() === preferenceMatch.preferred.toLowerCase()
    );
    if (ctgbMatch) return ctgbMatch;
  }

  // 2. Exact name match
  const exactMatch = ctgbProducts.find(c =>
    c.naam.toLowerCase() === normalizedAlias
  );
  if (exactMatch) return exactMatch;

  // 3. Starts with match
  const startsWithMatch = ctgbProducts.find(c =>
    c.naam.toLowerCase().startsWith(normalizedAlias) ||
    normalizedAlias.startsWith(c.naam.toLowerCase().split(' ')[0])
  );
  if (startsWithMatch) return startsWithMatch;

  // 4. Contains match (for partial names like "captan" -> "Captan 80 WDG")
  const containsMatch = ctgbProducts.find(c =>
    c.naam.toLowerCase().includes(normalizedAlias) ||
    normalizedAlias.includes(c.naam.toLowerCase().split(' ')[0])
  );
  if (containsMatch) return containsMatch;

  // 5. First word match
  const inputFirstWord = normalizedAlias.split(' ')[0];
  const firstWordMatch = ctgbProducts.find(c =>
    c.naam.toLowerCase().split(' ')[0] === inputFirstWord
  );
  if (firstWordMatch) return firstWordMatch;

  // 6. Search in werkzameStoffen (active substances)
  const substanceMatch = ctgbProducts.find(c =>
    c.werkzameStoffen?.some(s => s.toLowerCase().includes(normalizedAlias))
  );
  if (substanceMatch) return substanceMatch;

  return null;
}

function matchParcel(parcelName: string, parcels: Parcel[]): Parcel | null {
  const normalizedName = parcelName.toLowerCase().trim();

  // Exact name match
  const exactMatch = parcels.find(p => p.name.toLowerCase() === normalizedName);
  if (exactMatch) return exactMatch;

  // Partial match
  const partialMatch = parcels.find(p =>
    p.name.toLowerCase().includes(normalizedName) ||
    normalizedName.includes(p.name.toLowerCase())
  );
  if (partialMatch) return partialMatch;

  return null;
}

// ============================================
// Convert ValidationFlag to ValidationWarning
// ============================================

function convertValidationFlags(flags: ValidationFlag[]): ValidationWarning[] {
  return flags.map(flag => {
    let type: ValidationWarning['type'] = flag.type;

    // Map specific validation types
    if (flag.field === 'products' && flag.details?.substance) {
      type = 'substance_limit';
    } else if (flag.field === 'date' && flag.details?.minRequired) {
      type = 'interval_violation';
    } else if (flag.field === 'dosage') {
      type = 'dosage_exceeded';
    }

    return {
      type,
      message: flag.message,
      field: flag.field,
      details: flag.details
    };
  });
}

// ============================================
// Main API Handler
// ============================================

export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeInputResponse>> {
  try {
    // 1. Authentication Check
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, warnings: [], error: 'Geen authenticatie token gevonden.' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    let userId: string;

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      userId = decodedToken.uid;
    } catch (authError) {
      console.error('[analyze-input] Auth error:', authError);
      return NextResponse.json(
        { success: false, warnings: [], error: 'Ongeldige of verlopen authenticatie token.' },
        { status: 401 }
      );
    }

    // 2. Rate Limiting Check
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          warnings: [],
          error: `Te veel verzoeken. Probeer opnieuw over ${rateLimit.retryAfter} seconden.`
        },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
      );
    }

    // 3. Parse Request Body
    let body: AnalyzeInputRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, warnings: [], error: 'Ongeldige request body.' },
        { status: 400 }
      );
    }

    if (!body.input || typeof body.input !== 'string' || body.input.trim().length < 5) {
      return NextResponse.json(
        { success: false, warnings: [], error: 'Invoer moet minimaal 5 tekens bevatten.' },
        { status: 400 }
      );
    }

    // 4. Fetch Context Data (CTGB as Single Source of Truth)
    const [parcels, userPreferences, ctgbProducts] = await Promise.all([
      getUserParcels(),
      getUserPreferences(),
      getCtgbProducts()
    ]);

    // 5. Call AI with Context
    const aiResponse = await callGeminiAPI(
      body.input.trim(),
      parcels,
      ctgbProducts,
      userPreferences
    );

    // 6. Match and validate parcels
    const warnings: ValidationWarning[] = [];
    const validatedParcels: Parcel[] = [];

    for (const parcelName of aiResponse.parcels) {
      const matched = matchParcel(parcelName, parcels);
      if (matched) {
        if (!validatedParcels.find(p => p.id === matched.id)) {
          validatedParcels.push(matched);
        }
      } else {
        warnings.push({
          type: 'parcel_not_found',
          message: `Perceel "${parcelName}" niet gevonden in de database.`,
          field: 'parcels',
          suggestion: parcels.length > 0
            ? `Bekende percelen: ${parcels.slice(0, 5).map(p => p.name).join(', ')}${parcels.length > 5 ? '...' : ''}`
            : undefined
        });
      }
    }

    // 7. Match and validate products against CTGB
    const validatedProducts: ValidatedProduct[] = [];

    for (const product of aiResponse.products) {
      const ctgbProduct = fuzzyMatchCtgbProduct(product.alias, ctgbProducts, userPreferences);

      if (!ctgbProduct) {
        warnings.push({
          type: 'product_not_found',
          message: `Product "${product.alias}" niet gevonden in CTGB database.`,
          field: 'products'
        });

        validatedProducts.push({
          product: product.alias,
          dosage: product.dosage,
          unit: product.unit,
          originalAlias: product.alias
        });
        continue;
      }

      // Find gebruiksvoorschrift for crop context
      const uniqueCrops = [...new Set(validatedParcels.map(p => p.crop).filter(Boolean))];
      let maxDosering: string | undefined;
      let maxToepassingen: number | undefined;

      for (const crop of uniqueCrops) {
        const voorschrift = findGebruiksvoorschrift(ctgbProduct, crop);
        if (voorschrift) {
          maxDosering = voorschrift.dosering;
          maxToepassingen = voorschrift.maxToepassingen;
          break;
        }
      }

      validatedProducts.push({
        product: ctgbProduct.naam,
        dosage: product.dosage,
        unit: product.unit,
        originalAlias: product.alias,
        ctgbMatch: {
          toelatingsnummer: ctgbProduct.toelatingsnummer,
          naam: ctgbProduct.naam,
          werkzameStoffen: ctgbProduct.werkzameStoffen || [],
          maxDosering,
          maxToepassingen
        }
      });
    }

    // 8. Run full validation with ValidationService
    // Determine application date
    const applicationDate = aiResponse.date
      ? new Date(aiResponse.date)
      : new Date();

    // Get season history for cumulative validation
    const season = getCurrentSeason(applicationDate);
    const parcelIds = validatedParcels.map(p => p.id);
    const seasonHistoryMap = await getParcelSeasonHistory(parcelIds, season.start, season.end);

    // Run validation for each parcel × product combination
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const parcel of validatedParcels) {
      const parcelHistory = seasonHistoryMap.get(parcel.id) || [];

      for (const validatedProduct of validatedProducts) {
        if (!validatedProduct.ctgbMatch) continue;

        // Find the full CTGB product
        const ctgbProduct = ctgbProducts.find(
          p => p.toelatingsnummer === validatedProduct.ctgbMatch!.toelatingsnummer
        );
        if (!ctgbProduct) continue;

        // Run validation
        const validationResult: ValidationResult = await validateSprayApplication(
          parcel,
          ctgbProduct,
          validatedProduct.dosage,
          validatedProduct.unit,
          applicationDate,
          parcelHistory,
          ctgbProducts
        );

        // Convert and add validation flags
        const convertedWarnings = convertValidationFlags(validationResult.flags);

        // Prefix messages with parcel name for clarity
        for (const warning of convertedWarnings) {
          warning.message = `[${parcel.name}] ${warning.message}`;
          warnings.push(warning);

          if (warning.type === 'error') totalErrors++;
          else if (warning.type === 'warning') totalWarnings++;
        }
      }
    }

    // 9. Return Response
    return NextResponse.json({
      success: true,
      data: {
        date: aiResponse.date,
        parcels: validatedParcels.map(p => ({
          id: p.id,
          name: p.name,
          crop: p.crop,
          variety: p.variety
        })),
        products: validatedProducts,
        validationSummary: {
          isValid: totalErrors === 0,
          errorCount: totalErrors,
          warningCount: totalWarnings
        }
      },
      warnings
    });

  } catch (error) {
    console.error('[analyze-input] Unexpected error:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : 'Er is een onverwachte fout opgetreden.';

    return NextResponse.json(
      { success: false, warnings: [], error: errorMessage },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET(): Promise<NextResponse> {
  const hasApiKey = !!process.env.GEMINI_API_KEY;

  return NextResponse.json({
    status: 'ok',
    version: '2.0',
    features: {
      authentication: true,
      rateLimiting: true,
      ctgbSingleSourceOfTruth: true,
      activeSubstanceCumulation: true,
      cropHierarchy: true,
      dosageValidation: true,
      intervalValidation: true
    },
    configured: {
      geminiApiKey: hasApiKey
    }
  });
}

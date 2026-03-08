/**
 * Regression Test Corpus voor Slimme Invoer V2
 *
 * 50+ echte teler-invoer scenario's om de parsing en agent te testen.
 * Elk scenario bevat:
 * - Sequentie van gebruikersberichten
 * - Verwachte output (percelen, producten, doseringen)
 *
 * Run: npx tsx scripts/run-regression-tests.ts
 */

export interface RegressionTest {
    id: string;
    beschrijving: string;
    categorie: 'simpel' | 'exception' | 'tankmenging' | 'multi-turn' | 'informeel' | 'datum' | 'variatie' | 'correctie' | 'groep' | 'meststof';
    berichten: string[];
    verwacht: {
        aantalUnits: number;
        percelen?: string[];                    // Verwachte perceelnamen (partial match)
        perceelCriteria?: {
            crop?: string;                       // Alle percelen moeten dit gewas hebben
            variety?: string;                    // Alle percelen moeten dit ras hebben
            minAantal?: number;                  // Minimum aantal percelen
            maxAantal?: number;                  // Maximum aantal percelen
            nietAanwezig?: string[];             // Deze mogen NIET in de output zitten
        };
        producten: string[];                    // Verwachte productnamen (partial match)
        doseringen?: Record<string, number>;    // Product → dosering
        units?: Record<string, string>;         // Product → unit (L/ha of kg/ha)
        datumRelatief?: 'vandaag' | 'gisteren' | 'eergisteren' | 'morgen';
        datumAbsoluut?: string;                 // ISO date string
        registrationType?: 'spraying' | 'spreading'; // Verwachte registration type
        productSources?: Record<string, 'ctgb' | 'fertilizer'>; // Product → verwachte source
    };
    opmerkingen?: string;
}

// ============================================================================
// SIMPELE REGISTRATIES
// ============================================================================

const simpeleTests: RegressionTest[] = [
    {
        id: 'simpel-001',
        beschrijving: 'Alle peren met merpan en dosering',
        categorie: 'simpel',
        berichten: ['gisteren alle peren met merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer', minAantal: 1 },
            producten: ['Merpan'],
            doseringen: { 'Merpan': 2 },
            units: { 'Merpan': 'kg/ha' },
            datumRelatief: 'gisteren',
        },
    },
    {
        id: 'simpel-002',
        beschrijving: 'Alle appels met captan',
        categorie: 'simpel',
        berichten: ['vandaag alle appels gespoten met captan 1.5L'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Appel', minAantal: 1 },
            producten: ['Captan'],
            doseringen: { 'Captan': 1.5 },
            datumRelatief: 'vandaag',
        },
    },
    {
        id: 'simpel-003',
        beschrijving: 'Conference percelen met score',
        categorie: 'simpel',
        berichten: ['alle conference met score 0.3L'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { variety: 'Conference', minAantal: 1 },
            producten: ['Score'],
            doseringen: { 'Score': 0.3 },
            datumRelatief: 'vandaag',
        },
    },
    {
        id: 'simpel-004',
        beschrijving: 'Elstar percelen met delan',
        categorie: 'simpel',
        berichten: ['elstar gespoten met delan 0.75 kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { variety: 'Elstar', minAantal: 1 },
            producten: ['Delan'],
            doseringen: { 'Delan': 0.75 },
            units: { 'Delan': 'kg/ha' },
        },
    },
    {
        id: 'simpel-005',
        beschrijving: 'Specifiek perceel bij naam',
        categorie: 'simpel',
        berichten: ['stadhoek gespoten met merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            percelen: ['Stadhoek'],
            producten: ['Merpan'],
            doseringen: { 'Merpan': 2 },
        },
    },
    {
        id: 'simpel-006',
        beschrijving: 'Heel het bedrijf',
        categorie: 'simpel',
        berichten: ['vandaag heel het bedrijf met surround 25kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { minAantal: 5 }, // Moet meerdere percelen zijn
            producten: ['Surround'],
            doseringen: { 'Surround': 25 },
            units: { 'Surround': 'kg/ha' },
        },
    },
    {
        id: 'simpel-007',
        beschrijving: 'Alle bomen',
        categorie: 'simpel',
        berichten: ['alle bomen met captan 1.5L'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { minAantal: 5 },
            producten: ['Captan'],
        },
    },
    {
        id: 'simpel-008',
        beschrijving: 'Zonder dosering - moet om dosering vragen',
        categorie: 'simpel',
        berichten: ['gisteren alle peren met merpan'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            doseringen: { 'Merpan': 0 }, // Nog niet ingevuld
        },
        opmerkingen: 'Systeem moet om dosering vragen',
    },
];

// ============================================================================
// EXCEPTION TESTS (BEHALVE, NIET)
// ============================================================================

const exceptionTests: RegressionTest[] = [
    {
        id: 'exception-001',
        beschrijving: 'Alle appels behalve elstar',
        categorie: 'exception',
        berichten: ['alle appels met captan 1.5L, maar elstar niet'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: {
                crop: 'Appel',
                minAantal: 1,
                nietAanwezig: ['Elstar'],
            },
            producten: ['Captan'],
        },
    },
    {
        id: 'exception-002',
        beschrijving: 'Alle peren behalve conference',
        categorie: 'exception',
        berichten: ['alle peren met score 0.3L behalve conference'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: {
                crop: 'Peer',
                nietAanwezig: ['Conference'],
            },
            producten: ['Score'],
        },
    },
    {
        id: 'exception-003',
        beschrijving: 'Tessa niet',
        categorie: 'exception',
        berichten: ['alle peren met merpan 2kg, tessa niet'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: {
                crop: 'Peer',
                nietAanwezig: ['Tessa'],
            },
            producten: ['Merpan'],
        },
    },
    {
        id: 'exception-004',
        beschrijving: 'Behalve specifiek perceel',
        categorie: 'exception',
        berichten: ['alle appels met delan 0.75kg behalve jachthoek'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: {
                crop: 'Appel',
                nietAanwezig: ['Jachthoek'],
            },
            producten: ['Delan'],
        },
    },
    {
        id: 'exception-005',
        beschrijving: 'Meerdere uitzonderingen',
        categorie: 'exception',
        berichten: ['alle appels met captan, behalve elstar en kanzi'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: {
                crop: 'Appel',
                nietAanwezig: ['Elstar', 'Kanzi'],
            },
            producten: ['Captan'],
        },
    },
];

// ============================================================================
// TANKMENGING TESTS (MEERDERE PRODUCTEN)
// ============================================================================

const tankmengingTests: RegressionTest[] = [
    {
        id: 'tank-001',
        beschrijving: 'Twee producten in één mix',
        categorie: 'tankmenging',
        berichten: ['alle conference met score 0.3L en merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { variety: 'Conference' },
            producten: ['Score', 'Merpan'],
            doseringen: { 'Score': 0.3, 'Merpan': 2 },
        },
    },
    {
        id: 'tank-002',
        beschrijving: 'Drie producten',
        categorie: 'tankmenging',
        berichten: ['alle peren met score 0.3, merpan 2kg en surround 25kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Score', 'Merpan', 'Surround'],
        },
    },
    {
        id: 'tank-003',
        beschrijving: 'Getankt met meerdere middelen',
        categorie: 'tankmenging',
        berichten: ['getankt met captan 1.5L en delan 0.75kg op alle appels'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Appel' },
            producten: ['Captan', 'Delan'],
        },
    },
    {
        id: 'tank-004',
        beschrijving: 'Plus notatie',
        categorie: 'tankmenging',
        berichten: ['alle peren met merpan 2kg + score 0.3L'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan', 'Score'],
        },
    },
];

// ============================================================================
// MULTI-TURN TESTS (CONVERSATIE)
// ============================================================================

const multiTurnTests: RegressionTest[] = [
    {
        id: 'multi-001',
        beschrijving: 'Dosering invullen na vraag',
        categorie: 'multi-turn',
        berichten: [
            'gisteren alle peren met merpan',
            '2 kg',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            doseringen: { 'Merpan': 2 },
        },
    },
    {
        id: 'multi-002',
        beschrijving: 'Perceel verwijderen',
        categorie: 'multi-turn',
        berichten: [
            'alle peren met merpan 2kg',
            'tessa niet',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: {
                crop: 'Peer',
                nietAanwezig: ['Tessa'],
            },
            producten: ['Merpan'],
        },
    },
    {
        id: 'multi-003',
        beschrijving: 'Product toevoegen',
        categorie: 'multi-turn',
        berichten: [
            'alle peren met merpan 2kg',
            'ook score 0.3L erbij',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan', 'Score'],
        },
    },
    {
        id: 'multi-004',
        beschrijving: 'Datum corrigeren',
        categorie: 'multi-turn',
        berichten: [
            'vandaag alle peren met merpan 2kg',
            'nee dat was gisteren',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            datumRelatief: 'gisteren',
        },
    },
    {
        id: 'multi-005',
        beschrijving: 'Dosering corrigeren',
        categorie: 'multi-turn',
        berichten: [
            'alle peren met merpan 2kg',
            'nee 1.5 kg',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            doseringen: { 'Merpan': 1.5 },
        },
    },
    {
        id: 'multi-006',
        beschrijving: 'Ongedaan maken',
        categorie: 'multi-turn',
        berichten: [
            'alle peren met merpan 2kg',
            'ook score 0.3L',
            'ongedaan maken',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            // Score moet weg zijn
        },
        opmerkingen: 'Na undo moet Score verwijderd zijn',
    },
];

// ============================================================================
// INFORMEEL TAALGEBRUIK
// ============================================================================

const informeelTests: RegressionTest[] = [
    {
        id: 'informeel-001',
        beschrijving: 'Getankt met...',
        categorie: 'informeel',
        berichten: ['getankt met captan, alle bomen'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { minAantal: 5 },
            producten: ['Captan'],
        },
    },
    {
        id: 'informeel-002',
        beschrijving: 'Gespoten zonder "met"',
        categorie: 'informeel',
        berichten: ['gisteren peren merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
        },
    },
    {
        id: 'informeel-003',
        beschrijving: 'Korte notatie',
        categorie: 'informeel',
        berichten: ['peren merpan 2'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            doseringen: { 'Merpan': 2 },
        },
    },
    {
        id: 'informeel-004',
        beschrijving: 'Halve dosering',
        categorie: 'informeel',
        berichten: ['alle peren halve dosering merpan'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
        },
        opmerkingen: 'Halve dosering = 50% van max CTGB',
    },
    {
        id: 'informeel-005',
        beschrijving: 'Komma als decimaal',
        categorie: 'informeel',
        berichten: ['alle peren met merpan 2,5 kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            doseringen: { 'Merpan': 2.5 },
        },
    },
    {
        id: 'informeel-006',
        beschrijving: 'Per hectare expliciet',
        categorie: 'informeel',
        berichten: ['alle appels met 1.5 liter captan per hectare'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Appel' },
            producten: ['Captan'],
            doseringen: { 'Captan': 1.5 },
        },
    },
    {
        id: 'informeel-007',
        beschrijving: 'Typo in productnaam',
        categorie: 'informeel',
        berichten: ['alle peren met merpen 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'], // Moet gecorrigeerd worden
        },
        opmerkingen: 'Fuzzy matching moet "merpen" → "Merpan" herkennen',
    },
];

// ============================================================================
// DATUM VARIATIES
// ============================================================================

const datumTests: RegressionTest[] = [
    {
        id: 'datum-001',
        beschrijving: 'Gisteren',
        categorie: 'datum',
        berichten: ['gisteren alle peren met merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            datumRelatief: 'gisteren',
        },
    },
    {
        id: 'datum-002',
        beschrijving: 'Eergisteren',
        categorie: 'datum',
        berichten: ['eergisteren alle peren met merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            datumRelatief: 'eergisteren',
        },
    },
    {
        id: 'datum-003',
        beschrijving: 'Vandaag impliciet',
        categorie: 'datum',
        berichten: ['alle peren met merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            datumRelatief: 'vandaag',
        },
    },
    {
        id: 'datum-004',
        beschrijving: 'Datum in tekst',
        categorie: 'datum',
        berichten: ['17 februari alle peren met merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
        },
        opmerkingen: 'Datum moet 17 februari zijn',
    },
    {
        id: 'datum-005',
        beschrijving: 'Vorige week',
        categorie: 'datum',
        berichten: ['vorige week dinsdag alle peren met merpan 2kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
        },
        opmerkingen: 'Datum moet berekend worden',
    },
];

// ============================================================================
// VARIATIE TESTS (MEERDERE UNITS)
// ============================================================================

const variatieTests: RegressionTest[] = [
    {
        id: 'variatie-001',
        beschrijving: 'Appels andere dosering dan peren',
        categorie: 'variatie',
        berichten: ['alle appels met merpan 2kg, peren maar 1.5kg'],
        verwacht: {
            aantalUnits: 2,
            producten: ['Merpan'],
        },
        opmerkingen: 'Twee units: appels 2kg, peren 1.5kg',
    },
    {
        id: 'variatie-002',
        beschrijving: 'Extra product voor subset',
        categorie: 'variatie',
        berichten: ['alle peren met merpan 2kg, maar conference ook score 0.3L'],
        verwacht: {
            aantalUnits: 2,
            producten: ['Merpan', 'Score'],
        },
        opmerkingen: 'Conference krijgt beide producten',
    },
    {
        id: 'variatie-003',
        beschrijving: 'Jonge aanplant lagere dosering',
        categorie: 'variatie',
        berichten: ['alle peren met merpan 2kg, jonge bomen halve dosering'],
        verwacht: {
            aantalUnits: 2,
            producten: ['Merpan'],
        },
        opmerkingen: 'Jonge bomen = percelen met recent plantjaar',
    },
    {
        id: 'variatie-004',
        beschrijving: 'Verschillende datums per perceel',
        categorie: 'variatie',
        berichten: [
            'alle peren met merpan 2kg',
            'stadhoek was eergisteren',
        ],
        verwacht: {
            aantalUnits: 2, // Of 1 unit met afwijkende datum
            producten: ['Merpan'],
        },
        opmerkingen: 'Stadhoek krijgt andere datum',
    },
];

// ============================================================================
// CORRECTIE TESTS
// ============================================================================

const correctieTests: RegressionTest[] = [
    {
        id: 'correctie-001',
        beschrijving: 'Niet dat perceel',
        categorie: 'correctie',
        berichten: [
            'alle peren met merpan 2kg',
            'niet stadhoek',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: {
                crop: 'Peer',
                nietAanwezig: ['Stadhoek'],
            },
            producten: ['Merpan'],
        },
    },
    {
        id: 'correctie-002',
        beschrijving: 'Verwijder product',
        categorie: 'correctie',
        berichten: [
            'alle peren met merpan 2kg en score 0.3L',
            'verwijder score',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            // Score moet weg zijn
        },
    },
    {
        id: 'correctie-003',
        beschrijving: 'Wijzig dosering',
        categorie: 'correctie',
        berichten: [
            'alle peren met merpan 2kg',
            'maak merpan 1.5',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            doseringen: { 'Merpan': 1.5 },
        },
    },
    {
        id: 'correctie-004',
        beschrijving: 'Annuleren',
        categorie: 'correctie',
        berichten: [
            'alle peren met merpan 2kg',
            'stop',
        ],
        verwacht: {
            aantalUnits: 0, // Draft geannuleerd
            producten: [],
        },
    },
    {
        id: 'correctie-005',
        beschrijving: 'Voeg perceel toe',
        categorie: 'correctie',
        berichten: [
            'conference met merpan 2kg',
            'voeg ook de beurré lucas toe',
        ],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { minAantal: 2 },
            producten: ['Merpan'],
        },
    },
];

// ============================================================================
// GROEPERING TESTS (COMPLEXE SCENARIO'S)
// ============================================================================

const groeperingTests: RegressionTest[] = [
    {
        id: 'groep-001',
        beschrijving: 'Appels en peren apart',
        categorie: 'groep',
        berichten: ['alle appels met captan 1.5L, alle peren met merpan 2kg'],
        verwacht: {
            aantalUnits: 2,
            producten: ['Captan', 'Merpan'],
        },
    },
    {
        id: 'groep-002',
        beschrijving: 'Drie groepen',
        categorie: 'groep',
        berichten: ['elstar met delan 0.75kg, conference met score 0.3L, de rest met captan 1.5L'],
        verwacht: {
            aantalUnits: 3,
            producten: ['Delan', 'Score', 'Captan'],
        },
    },
    {
        id: 'groep-003',
        beschrijving: 'Rest van de peren',
        categorie: 'groep',
        berichten: ['conference met score 0.3L, de rest van de peren met merpan 2kg'],
        verwacht: {
            aantalUnits: 2,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Score', 'Merpan'],
        },
    },
];

// ============================================================================
// EDGE CASES
// ============================================================================

const edgeCaseTests: RegressionTest[] = [
    {
        id: 'edge-001',
        beschrijving: 'Lege invoer na start',
        categorie: 'simpel',
        berichten: ['gespoten'],
        verwacht: {
            aantalUnits: 0,
            producten: [],
        },
        opmerkingen: 'Systeem moet om meer info vragen',
    },
    {
        id: 'edge-002',
        beschrijving: 'Alleen product genoemd',
        categorie: 'simpel',
        berichten: ['merpan 2kg'],
        verwacht: {
            aantalUnits: 0,
            producten: ['Merpan'],
        },
        opmerkingen: 'Systeem moet om percelen vragen',
    },
    {
        id: 'edge-003',
        beschrijving: 'Alleen perceel genoemd',
        categorie: 'simpel',
        berichten: ['alle peren'],
        verwacht: {
            aantalUnits: 0,
            perceelCriteria: { crop: 'Peer' },
            producten: [],
        },
        opmerkingen: 'Systeem moet om product vragen',
    },
    {
        id: 'edge-004',
        beschrijving: 'Product dat niet bestaat',
        categorie: 'simpel',
        berichten: ['alle peren met wondermiddel 5L'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['wondermiddel'], // Onbekend product
        },
        opmerkingen: 'Moet warning geven over onbekend product',
    },
    {
        id: 'edge-005',
        beschrijving: 'Extreme dosering',
        categorie: 'simpel',
        berichten: ['alle peren met merpan 100kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer' },
            producten: ['Merpan'],
            doseringen: { 'Merpan': 100 },
        },
        opmerkingen: 'Moet warning geven over hoge dosering',
    },
    {
        id: 'edge-006',
        beschrijving: 'Perceel dat niet bestaat',
        categorie: 'simpel',
        berichten: ['fantoomveld met merpan 2kg'],
        verwacht: {
            aantalUnits: 0,
            producten: ['Merpan'],
        },
        opmerkingen: 'Moet error geven over onbekend perceel',
    },
];

// ============================================================================
// MESTSTOF TESTS
// ============================================================================

const meststofTests: RegressionTest[] = [
    {
        id: 'meststof-001',
        beschrijving: 'Gemengde registratie: GWB + meststof in één spuitmengsel',
        categorie: 'meststof',
        berichten: ['vandaag alle peren met merpan 2kg en chelal omnical 3L'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer', minAantal: 1 },
            producten: ['Merpan', 'Chelal Omnical'],
            doseringen: { 'Merpan': 2, 'Chelal Omnical': 3 },
            units: { 'Merpan': 'kg/ha', 'Chelal Omnical': 'L/ha' },
            registrationType: 'spraying',
            productSources: { 'Merpan': 'ctgb', 'Chelal Omnical': 'fertilizer' },
        },
        opmerkingen: 'Merpan = CTGB, Chelal Omnical = meststof. Beide in één bespuiting. CTGB-validatie alleen op Merpan.',
    },
    {
        id: 'meststof-002',
        beschrijving: 'Strooiregistratie: alleen meststof',
        categorie: 'meststof',
        berichten: ['gisteren kalkammonsalpeter gestrooid op alle appels 300kg/ha'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Appel', minAantal: 1 },
            producten: ['Kalkammonsalpeter'],
            doseringen: { 'Kalkammonsalpeter': 300 },
            units: { 'Kalkammonsalpeter': 'kg/ha' },
            registrationType: 'spreading',
            productSources: { 'Kalkammonsalpeter': 'fertilizer' },
            datumRelatief: 'gisteren',
        },
        opmerkingen: 'Keyword "gestrooid" → spreading. Geen CTGB-validatie nodig.',
    },
    {
        id: 'meststof-003',
        beschrijving: 'Cache hit: veelvoorkomende meststof direct uit cache',
        categorie: 'meststof',
        berichten: ['alle peren met bittersalz 5kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer', minAantal: 1 },
            producten: ['Bittersalz'],
            doseringen: { 'Bittersalz': 5 },
            units: { 'Bittersalz': 'kg/ha' },
            registrationType: 'spraying',
            productSources: { 'Bittersalz': 'fertilizer' },
        },
        opmerkingen: 'Bittersalz zit in COMMON_FERTILIZERS_CACHE, moet direct matchen zonder DB lookup.',
    },
    {
        id: 'meststof-004',
        beschrijving: 'Alleen CTGB producten: geen meststof interferentie',
        categorie: 'meststof',
        berichten: ['vandaag alle appels met captan 1.5L en delan 0.5kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Appel', minAantal: 1 },
            producten: ['Captan', 'Delan'],
            doseringen: { 'Captan': 1.5, 'Delan': 0.5 },
            registrationType: 'spraying',
            productSources: { 'Captan': 'ctgb', 'Delan': 'ctgb' },
        },
        opmerkingen: 'Pure GWB-bespuiting. Meststof-lookup mag geen false positives geven.',
    },
    {
        id: 'meststof-005',
        beschrijving: 'Meststof alias resolutie: bijnaam naar officieel product',
        categorie: 'meststof',
        berichten: ['alle peren met bitterzout 5kg'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer', minAantal: 1 },
            producten: ['Bittersalz'],
            doseringen: { 'Bittersalz': 5 },
            registrationType: 'spraying',
            productSources: { 'Bittersalz': 'fertilizer' },
        },
        opmerkingen: 'Alias "bitterzout" → "Bittersalz" via cache alias of fertilizer_aliases tabel.',
    },
    {
        id: 'meststof-006',
        beschrijving: 'Strooien keywords herkenning: bemesting',
        categorie: 'meststof',
        berichten: ['patentkali bemesting alle appels 250kg/ha'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Appel', minAantal: 1 },
            producten: ['Patentkali'],
            doseringen: { 'Patentkali': 250 },
            registrationType: 'spreading',
            productSources: { 'Patentkali': 'fertilizer' },
        },
        opmerkingen: 'Keyword "bemesting" → spreading registration type.',
    },
    {
        id: 'meststof-007',
        beschrijving: 'Cross-database preventie: CTGB product mag niet als meststof resolved worden',
        categorie: 'meststof',
        berichten: ['vandaag alle peren met merpan 2kg en ureum 3L'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer', minAantal: 1 },
            producten: ['Merpan', 'Ureum'],
            doseringen: { 'Merpan': 2, 'Ureum': 3 },
            registrationType: 'spraying',
            productSources: { 'Merpan': 'ctgb', 'Ureum': 'fertilizer' },
        },
        opmerkingen: 'Merpan is CTGB, Ureum is meststof. Geen cross-database verwarring.',
    },
    {
        id: 'meststof-008',
        beschrijving: 'Gemengd met validatie: CTGB product gevalideerd, meststof overgeslagen',
        categorie: 'meststof',
        berichten: ['alle peren met captan 1.5L en chelal az 2L en chelal b 1L'],
        verwacht: {
            aantalUnits: 1,
            perceelCriteria: { crop: 'Peer', minAantal: 1 },
            producten: ['Captan', 'Chelal AZ', 'Chelal B'],
            doseringen: { 'Captan': 1.5, 'Chelal AZ': 2, 'Chelal B': 1 },
            registrationType: 'spraying',
            productSources: { 'Captan': 'ctgb', 'Chelal AZ': 'fertilizer', 'Chelal B': 'fertilizer' },
        },
        opmerkingen: 'Captan krijgt CTGB-validatie (dosering, toelating). Chelal AZ en Chelal B worden overgeslagen bij validatie.',
    },
];

// ============================================================================
// ALLE TESTS COMBINEREN
// ============================================================================

export const alleTests: RegressionTest[] = [
    ...simpeleTests,
    ...exceptionTests,
    ...tankmengingTests,
    ...multiTurnTests,
    ...informeelTests,
    ...datumTests,
    ...variatieTests,
    ...correctieTests,
    ...groeperingTests,
    ...edgeCaseTests,
    ...meststofTests,
];

// Categorieën voor filtering
export const testCategorieen = {
    simpel: simpeleTests,
    exception: exceptionTests,
    tankmenging: tankmengingTests,
    'multi-turn': multiTurnTests,
    informeel: informeelTests,
    datum: datumTests,
    variatie: variatieTests,
    correctie: correctieTests,
    groep: groeperingTests,
    edge: edgeCaseTests,
    meststof: meststofTests,
};

console.log(`Regression corpus geladen: ${alleTests.length} tests`);
console.log(`Categorieën: ${Object.keys(testCategorieen).join(', ')}`);

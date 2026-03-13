import {
  Home,
  Clock,
  Map,
  ClipboardList,
  Package,
  FlaskConical,
  Database,
  Sprout,
  Apple,
  Thermometer,
  BarChart3,
  SlidersHorizontal,
  Truck,
  Users,
  BookOpen,
  Library,
  CloudSun,
} from 'lucide-react';

export interface WegwijzerSection {
  id: string;
  title: string;
  parentLabel: string;
  icon: any;
  shortDescription: string;
  wat: string;
  hoeWerktHet: string[];
  voorbeeld: string;
  tips: string[];
  samenhang: string[];
  relatedSections: string[];
  keywords: string[];
  route: string;
}

export const wegwijzerSections: WegwijzerSection[] = [
  {
    id: 'slimme-invoer',
    title: 'Slimme Invoer',
    parentLabel: 'Command Center',
    icon: Home,
    shortDescription: 'Typ in natuurlijke taal wat je hebt gespoten of bemest — de AI regelt de rest.',
    wat: 'Het hart van CropNode. Typ in natuurlijke taal wat je hebt gespoten of bemest, en de AI regelt de rest. Geen ingewikkelde formulieren, gewoon typen zoals je het tegen een collega zou zeggen.',
    hoeWerktHet: [
      'Typ een bericht zoals je het tegen een collega zou zeggen',
      'De AI herkent automatisch: producten, percelen, doseringen en datums',
      'Het systeem valideert tegen de CTGB-database (gewasbescherming) of de meststoffendatabase',
      'Je krijgt een overzichtelijke samenvatting te zien die je kunt bevestigen of aanpassen',
    ],
    voorbeeld: '"Gisteren alle peren gespoten met Captan 0.5 kg en Delan 0.5 kg per hectare"\n\nDe AI herkent: 2 producten, alle percelen met gewas \'peer\', dosering per product, datum = gisteren. Je krijgt een registratiekaart die je met \u00e9\u00e9n klik bevestigt.\n\n"Vandaag Wuxal Calcium op blok 3 en 4 gespoten, 3 liter per hectare"\n\nDe AI herkent: meststof (bladbemesting), twee percelen, dosering.',
    tips: [
      'Je hoeft geen exacte productnamen te gebruiken \u2014 "Captan" vindt "Captan 500 SC" automatisch',
      'Je kunt meerdere producten in \u00e9\u00e9n zin combineren',
      'Als iets onduidelijk is, stelt de AI een vervolgvraag',
    ],
    samenhang: [
      'Bevestigde registraties verschijnen in \u2192 Tijdlijn en Spuitschrift',
      'Productvalidatie gebruikt \u2192 Database Gewasbescherming en Database Meststoffen',
      'Perceelmatching gebruikt \u2192 Percelen',
    ],
    relatedSections: ['tijdlijn', 'spuitschrift', 'database-gewasbescherming', 'database-meststoffen', 'percelen'],
    keywords: ['slimme invoer', 'command center', 'registratie', 'spuiten', 'bemesten', 'AI', 'natuurlijke taal', 'spray', 'bespuiting'],
    route: '/command-center/smart-input-v2',
  },
  {
    id: 'tijdlijn',
    title: 'Tijdlijn',
    parentLabel: 'Command Center',
    icon: Clock,
    shortDescription: 'Chronologisch overzicht van al je geregistreerde activiteiten.',
    wat: 'Je complete activiteitenlogboek, gesorteerd op datum. Zie in \u00e9\u00e9n oogopslag wat je wanneer hebt gedaan op welk perceel.',
    hoeWerktHet: [
      'Toont alle registraties op een tijdlijn, gesorteerd op datum',
      'Je ziet in \u00e9\u00e9n oogopslag wat je wanneer hebt gedaan',
      'Klik op een registratie om details te bekijken of te bewerken',
    ],
    voorbeeld: 'Open de Tijdlijn en je ziet:\n\u2022 15 maart: Captan + Delan op alle peren\n\u2022 12 maart: Snoeiregistratie Blok 1-3\n\u2022 10 maart: Calcium bemesting Conference',
    tips: [
      'Gebruik de Tijdlijn om te checken of je niets vergeten bent',
      'Handig voor audits of als een adviseur langskomt',
    ],
    samenhang: [
      'Wordt gevuld door \u2192 Slimme Invoer',
      'Details per registratie linken naar \u2192 Spuitschrift',
    ],
    relatedSections: ['slimme-invoer', 'spuitschrift'],
    keywords: ['tijdlijn', 'chronologisch', 'overzicht', 'activiteiten', 'logboek', 'historie'],
    route: '/command-center/timeline',
  },
  {
    id: 'percelen',
    title: 'Percelen',
    parentLabel: 'Percelen',
    icon: Map,
    shortDescription: 'Beheer al je percelen, blokken en boomgaarden \u2014 de basis van al je registraties.',
    wat: 'Beheer al je percelen, blokken en boomgaarden. De basis van al je registraties. Zonder percelen kan de rest van het platform niet werken. Je kunt percelen overnemen van de RVO-kaart (luchtfoto met gewaspercelen) of zelf intekenen op de kaart als een perceel niet bij RVO bekend is.',
    hoeWerktHet: [
      'Voeg percelen toe met naam, gewas (appel/peer), ras, oppervlakte in hectare',
      'Kies "Locatie aanwijzen op kaart" om een RVO-perceel te selecteren \u2014 grenzen en oppervlakte worden automatisch overgenomen',
      'Staat je perceel niet in RVO? Kies "Perceel intekenen" en teken zelf de grenzen door punten op de kaart te plaatsen',
      'Bij het intekenen: klik punt voor punt de omtrek van je perceel, klik op het eerste punt om het polygoon te sluiten \u2014 de oppervlakte wordt automatisch berekend',
      'Op de kaartweergave kun je ook direct op "Perceel intekenen" klikken om een nieuw perceel in te tekenen terwijl je de luchtfoto en bestaande percelen als referentie ziet',
      'Geef percelen herkenbare namen die je in het veld gebruikt',
      'De Slimme Invoer matcht automatisch op deze namen',
    ],
    voorbeeld: 'Via RVO-kaart:\n\u2022 Open de kaart \u2192 zoom naar je perceel \u2192 klik op het groene RVO-vlak \u2192 "Grenzen overnemen" \u2192 naam invullen \u2192 opslaan\n\nZelf intekenen:\n\u2022 Open de kaart \u2192 klik "Perceel intekenen" \u2192 klik de hoekpunten van je perceel op de luchtfoto \u2192 klik op het eerste punt om te sluiten \u2192 "Grenzen overnemen" \u2192 naam invullen \u2192 opslaan\n\nDaarna kun je in Slimme Invoer typen: "Luisweg gespoten met Captan" en het systeem weet precies welk perceel je bedoelt.',
    tips: [
      'Gebruik dezelfde namen als die je in de praktijk gebruikt \u2014 de AI leert jouw naamgeving',
      'Voeg alle percelen toe voordat je begint met registreren',
      'Staat een perceel niet in RVO? Geen probleem \u2014 teken het zelf in op de luchtfoto',
      'Je kunt zowel RVO-percelen als zelf ingetekende percelen samen selecteren in registraties',
      'Bij het intekenen zie je de luchtfoto en bestaande percelen als referentie, zodat je precies weet waar je grenzen liggen',
    ],
    samenhang: [
      'Wordt gebruikt door \u2192 Slimme Invoer (matching)',
      'Wordt gebruikt door \u2192 Spuitschrift (per perceel)',
      'Wordt gebruikt door \u2192 Perceelanalyse (opbrengsten)',
    ],
    relatedSections: ['slimme-invoer', 'spuitschrift', 'perceelanalyse'],
    keywords: ['percelen', 'blokken', 'boomgaard', 'gewas', 'ras', 'oppervlakte', 'hectare', 'intekenen', 'tekenen', 'kaart', 'RVO', 'polygoon'],
    route: '/parcels/list',
  },
  {
    id: 'spuitschrift',
    title: 'Spuitschrift',
    parentLabel: 'Crop Care',
    icon: ClipboardList,
    shortDescription: 'Je offici\u00eble gewasbeschermingslogboek \u2014 klaar voor controle.',
    wat: 'Je offici\u00eble gewasbeschermingslogboek. Alle bespuitingen netjes geordend per perceel en datum \u2014 klaar voor controle door de NVWA of je co\u00f6peratie.',
    hoeWerktHet: [
      'Wordt automatisch gevuld vanuit de Slimme Invoer',
      'Overzicht per perceel: welk product, welke dosering, welke datum',
      'Exporteerbaar voor co\u00f6peratie of NVWA-controle',
    ],
    voorbeeld: 'Open Spuitschrift voor perceel "Luisweg" en je ziet een tabel:\n\n| Datum | Product | Dosering | Gewas |\n| 15-03 | Captan 500 SC | 0.5 kg/ha | Peer |\n| 15-03 | Delan WG | 0.5 kg/ha | Peer |\n| 22-03 | Merpan | 0.75 kg/ha | Peer |',
    tips: [
      'Check regelmatig of alle bespuitingen correct zijn geregistreerd',
      'Het Spuitschrift is je bewijs bij een NVWA-controle',
    ],
    samenhang: [
      'Wordt gevuld door \u2192 Slimme Invoer',
      'Producten worden gevalideerd tegen \u2192 Database Gewasbescherming',
    ],
    relatedSections: ['slimme-invoer', 'database-gewasbescherming'],
    keywords: ['spuitschrift', 'logboek', 'bespuiting', 'gewasbescherming', 'NVWA', 'controle', 'export'],
    route: '/crop-care/logs',
  },
  {
    id: 'voorraad',
    title: 'Voorraad',
    parentLabel: 'Crop Care',
    icon: Package,
    shortDescription: 'Houd bij hoeveel gewasbeschermingsmiddelen en meststoffen je nog op voorraad hebt.',
    wat: 'Houd bij hoeveel gewasbeschermingsmiddelen en meststoffen je nog op voorraad hebt. Het systeem werkt je voorraad automatisch bij na elke registratie.',
    hoeWerktHet: [
      'Voeg producten toe met hoeveelheid',
      'Bij registraties via Slimme Invoer wordt de voorraad automatisch bijgewerkt',
      'Krijg een waarschuwing als een product bijna op is',
    ],
    voorbeeld: 'Je hebt 10 kg Captan 500 SC op voorraad. Na een bespuiting op 5 ha met 0.5 kg/ha trekt het systeem automatisch 2.5 kg af \u2192 restvoorraad: 7.5 kg.',
    tips: [
      'Vul je voorraad bij aan het begin van het seizoen',
      'Handig voor bestellijsten: zie direct wat bijna op is',
    ],
    samenhang: [
      'Wordt bijgewerkt door \u2192 Slimme Invoer registraties',
      'Producten uit \u2192 Database Gewasbescherming / Database Meststoffen',
    ],
    relatedSections: ['slimme-invoer', 'database-gewasbescherming', 'database-meststoffen'],
    keywords: ['voorraad', 'inventaris', 'producten', 'hoeveelheid', 'bestellen'],
    route: '/crop-care/inventory',
  },
  {
    id: 'mijn-producten',
    title: 'Mijn Producten',
    parentLabel: 'Crop Care',
    icon: FlaskConical,
    shortDescription: 'Je persoonlijke lijst van producten die je regelmatig gebruikt.',
    wat: 'Je persoonlijke lijst van producten die je regelmatig gebruikt. Sla je favorieten op voor snelle toegang bij het registreren.',
    hoeWerktHet: [
      'Sla je favoriete/meestgebruikte producten op',
      'Snelle toegang bij het registreren',
      'Zie per product de toelatingsstatus en doseervoorschriften',
    ],
    voorbeeld: 'Voeg je standaard seizoenspakket toe: Captan 500 SC, Delan WG, Merpan, Nimrod en Wuxal Calcium. Bij het typen in de Slimme Invoer worden deze producten direct herkend.',
    tips: [
      'Voeg je standaard seizoenspakket toe aan het begin van het jaar',
      'Maakt de Slimme Invoer sneller: bekende producten worden direct herkend',
    ],
    samenhang: [
      'Producten komen uit \u2192 Database Gewasbescherming / Database Meststoffen',
      'Worden gebruikt in \u2192 Slimme Invoer, Voorraad',
    ],
    relatedSections: ['database-gewasbescherming', 'database-meststoffen', 'slimme-invoer', 'voorraad'],
    keywords: ['mijn producten', 'favorieten', 'seizoenspakket', 'middelen'],
    route: '/crop-care/my-products',
  },
  {
    id: 'database-gewasbescherming',
    title: 'Database Gewasbescherming',
    parentLabel: 'Crop Care',
    icon: Database,
    shortDescription: 'De volledige CTGB-database met alle in Nederland toegelaten gewasbeschermingsmiddelen.',
    wat: 'De volledige CTGB-database met alle in Nederland toegelaten gewasbeschermingsmiddelen. Altijd up-to-date met de offici\u00eble registratie.',
    hoeWerktHet: [
      'Doorzoek alle toegelaten middelen op naam, werkzame stof of toepassing',
      'Zie per middel: toelatingsnummer, gewassen waarvoor het is toegelaten, doseringen, veiligheidstermijnen',
      'Altijd up-to-date met de offici\u00eble CTGB-registratie',
    ],
    voorbeeld: 'Zoek op "Captan" \u2192 vind Captan 500 SC, toelatingsnummer 12345, toegelaten in appel en peer, max dosering 0.5 kg/ha, veiligheidstermijn 28 dagen.',
    tips: [
      'Check hier altijd of een middel nog is toegelaten voordat je het koopt',
      'De Slimme Invoer gebruikt deze database automatisch voor validatie',
    ],
    samenhang: [
      'Wordt gebruikt door \u2192 Slimme Invoer (validatie)',
      'Wordt gebruikt door \u2192 Spuitschrift (productinfo)',
    ],
    relatedSections: ['slimme-invoer', 'spuitschrift'],
    keywords: ['CTGB', 'database', 'gewasbescherming', 'toelating', 'middelen', 'werkzame stof', 'veiligheidstermijn'],
    route: '/crop-care/db-protection',
  },
  {
    id: 'database-meststoffen',
    title: 'Database Meststoffen',
    parentLabel: 'Crop Care',
    icon: Sprout,
    shortDescription: 'Database met meststoffen \u2014 bladbemesting en strooimeststoffen.',
    wat: 'Database met meststoffen, onderverdeeld in bladbemesting en strooimeststoffen. Zoek op naam en vind samenstelling, doseeradvies en toepassingswijze.',
    hoeWerktHet: [
      'Zoek meststoffen op naam',
      'Zie samenstelling, doseeradvies en toepassingswijze',
      'Twee categorie\u00ebn: bladbemesting (via spuittank) en strooien (granulaat)',
    ],
    voorbeeld: 'Zoek op "Wuxal" \u2192 vind Wuxal Calcium, type bladbemesting, dosering 3-5 L/ha.',
    tips: [
      'Bij bladbemesting: deze producten meng je in de spuittank en registreer je via de Slimme Invoer',
      'Bij strooimeststoffen: apart registreren als strooiactie',
    ],
    samenhang: [
      'Wordt gebruikt door \u2192 Slimme Invoer (herkenning meststoffen)',
    ],
    relatedSections: ['slimme-invoer'],
    keywords: ['meststoffen', 'bemesting', 'bladbemesting', 'strooien', 'granulaat', 'nutrienten'],
    route: '/crop-care/db-fertilizer',
  },
  {
    id: 'oogstregistratie',
    title: 'Oogstregistratie',
    parentLabel: 'Harvest Hub',
    icon: Apple,
    shortDescription: 'Registreer je oogst per perceel \u2014 hoeveelheid, kwaliteit en ras.',
    wat: 'Registreer je oogst per perceel \u2014 hoeveelheid, kwaliteit en ras. Bouw seizoen na seizoen een oogsthistorie op per perceel.',
    hoeWerktHet: [
      'Voer per perceel in: datum, kilogrammen, kwaliteitsklasse, ras',
      'Later koppelbaar aan resultaten van het vision-systeem op de oogstmachine',
      'Bouw seizoen na seizoen een oogsthistorie op per perceel',
    ],
    voorbeeld: 'Perceel "Luisweg" \u2014 Oogst 15 september:\n\u2022 Conference Klasse I: 12.000 kg\n\u2022 Conference Klasse II: 3.000 kg\n\u2022 Industrie: 800 kg',
    tips: [
      'Registreer direct na het plukken voor de meest accurate data',
      'Vergelijk jaarlijks je opbrengsten per perceel',
    ],
    samenhang: [
      'Data gaat naar \u2192 Perceelanalyse, Koelcelbeheer (bij inslag)',
      'Koppelt met \u2192 Crop Care data voor input/output correlaties',
    ],
    relatedSections: ['perceelanalyse', 'koelcelbeheer', 'spuitschrift'],
    keywords: ['oogst', 'registratie', 'plukken', 'kilogrammen', 'kwaliteit', 'klasse'],
    route: '/harvest-hub/registration',
  },
  {
    id: 'koelcelbeheer',
    title: 'Koelcelbeheer',
    parentLabel: 'Harvest Hub',
    icon: Thermometer,
    shortDescription: 'Beheer je koelcellen visueel \u2014 teken je eigen plattegrond en houd per positie bij wat er staat.',
    wat: 'Beheer je koelcellen visueel \u2014 teken je eigen celplattegrond op de interactieve canvas en houd per stak/kist bij wat er staat.',
    hoeWerktHet: [
      'Teken je eigen celplattegrond op de interactieve canvas',
      'Registreer per positie: welk perceel, welk ras, inslagdatum, aantal kisten',
      'Visueel overzicht van bezetting en bewaarduur',
      'In- en uitslag registreren',
    ],
    voorbeeld: 'Cel 1 plattegrond: 4 rijen \u00d7 8 posities\n\u2022 Positie A1-A4: Conference van Luisweg, inslag 20 sept, 80 kisten\n\u2022 Positie B1-B8: Elstar van Blok 3, inslag 25 sept, 160 kisten',
    tips: [
      'Teken je plattegrond \u00e9\u00e9n keer, daarna alleen vullen en legen',
      'Handig om te zien hoeveel ruimte er nog is voor de volgende partij',
    ],
    samenhang: [
      'Gevuld met data uit \u2192 Oogstregistratie',
      'Uitslag gaat naar \u2192 Afleveroverzicht',
    ],
    relatedSections: ['oogstregistratie', 'afleveroverzicht'],
    keywords: ['koelcel', 'bewaring', 'opslag', 'kisten', 'inslag', 'uitslag', 'plattegrond'],
    route: '/harvest-hub/cold-storage',
  },
  {
    id: 'perceelanalyse',
    title: 'Perceelanalyse',
    parentLabel: 'Harvest Hub',
    icon: BarChart3,
    shortDescription: 'Vergelijk opbrengsten per perceel over seizoenen en ontdek patronen.',
    wat: 'Vergelijk opbrengsten per perceel over seizoenen en ontdek patronen. De plek waar input \u00d7 output samenkomt.',
    hoeWerktHet: [
      'Automatische grafieken en vergelijkingen op basis van je oogstdata',
      'Vergelijk percelen onderling: kg/ha, kwaliteitsverdeling, maatsortering',
      'Later: correlaties met Crop Care data (welke behandelingen \u2192 welke opbrengst)',
    ],
    voorbeeld: 'Grafiek toont: Luisweg levert consistent 15% meer Klasse I dan Het Achterveld, terwijl beide hetzelfde bespuitingsschema krijgen \u2192 misschien ligt het aan de grondsoort of het microklimaat.',
    tips: [
      'Hoe meer seizoenen data, hoe waardevoller de analyses',
      'Dit wordt d\u00e9 plek waar input \u00d7 output samenkomt',
    ],
    samenhang: [
      'Data uit \u2192 Oogstregistratie',
      'Data uit \u2192 Crop Care (bespuitingshistorie)',
    ],
    relatedSections: ['oogstregistratie', 'spuitschrift'],
    keywords: ['analyse', 'vergelijking', 'opbrengst', 'seizoenen', 'patronen', 'grafiek'],
    route: '/harvest-hub/field-analysis',
  },
  {
    id: 'sortering-kwaliteit',
    title: 'Sortering & Kwaliteit',
    parentLabel: 'Harvest Hub',
    icon: SlidersHorizontal,
    shortDescription: 'Bekijk maatsortering, kwaliteitsklassen en resultaten van het vision-systeem.',
    wat: 'Bekijk maatsortering, kwaliteitsklassen en resultaten van het vision-systeem. Track je kwaliteitsverdeling over de jaren.',
    hoeWerktHet: [
      'Overzicht maatsortering: verdeling over 60-65, 65-70, 70-75, 75-80 mm etc.',
      'Kwaliteitsklassen: Klasse I, II, industrie',
      'Later: directe koppeling met vision-systeem voor grondkleur, vruchtgrootte en defecten per boom',
    ],
    voorbeeld: 'Perceel "Luisweg" seizoen 2025:\n\u2022 60-65 mm: 15%\n\u2022 65-70 mm: 35%\n\u2022 70-75 mm: 30%\n\u2022 75-80 mm: 15%\n\u2022 80+ mm: 5%',
    tips: [
      'Track je maatsortering over de jaren om het effect van dunacties te meten',
      'Vision-data maakt dit op termijn per-boom nauwkeurig',
    ],
    samenhang: [
      'Data uit \u2192 Oogstregistratie',
      'Data uit \u2192 Vision-systeem (toekomstig)',
    ],
    relatedSections: ['oogstregistratie'],
    keywords: ['sortering', 'kwaliteit', 'maatsortering', 'klasse', 'vision', 'grootte'],
    route: '/harvest-hub/quality',
  },
  {
    id: 'afleveroverzicht',
    title: 'Afleveroverzicht',
    parentLabel: 'Harvest Hub',
    icon: Truck,
    shortDescription: 'Overzicht van wat je hebt afgeleverd aan veiling, co\u00f6peratie of afnemer.',
    wat: 'Overzicht van wat je hebt afgeleverd aan veiling, co\u00f6peratie of afnemer. Compleet met hoeveelheden, kwaliteit en optioneel prijsinformatie.',
    hoeWerktHet: [
      'Registreer afleveringen: datum, afnemer, hoeveelheid, ras, kwaliteit',
      'Koppeling met koelceluitslag',
      'Optioneel: prijsinformatie voor opbrengstberekening per perceel',
    ],
    voorbeeld: 'Aflevering 1 november:\n\u2022 Afnemer: Fruitmasters\n\u2022 Conference Klasse I: 8.000 kg\n\u2022 Conference Klasse II: 2.000 kg\n\u2022 Prijs: \u20ac0.65/kg Klasse I',
    tips: [
      'Houd dit bij voor een compleet financieel overzicht per seizoen',
      'Koppel aan koelceluitslag voor een sluitende administratie',
    ],
    samenhang: [
      'Data uit \u2192 Koelcelbeheer (uitslag)',
      'Data uit \u2192 Oogstregistratie',
    ],
    relatedSections: ['koelcelbeheer', 'oogstregistratie'],
    keywords: ['aflevering', 'veiling', 'cooperatie', 'afnemer', 'prijs', 'opbrengst'],
    route: '/harvest-hub/deliveries',
  },
  {
    id: 'team-tasks',
    title: 'Team & Tasks',
    parentLabel: 'Team & Tasks',
    icon: Users,
    shortDescription: 'Beheer je team en verdeel taken. Registreer gewerkte uren per medewerker.',
    wat: 'Beheer je team en verdeel taken. Registreer gewerkte uren per medewerker, per activiteit, per perceel.',
    hoeWerktHet: [
      'Voeg teamleden toe',
      'Wijs taken toe aan medewerkers',
      'Registreer uren per persoon, per activiteit, per perceel',
      'Overzicht van wie wat heeft gedaan',
    ],
    voorbeeld: '\u2022 Jan \u2014 8 uur snoeien \u2014 Blok 1 t/m 3 \u2014 14 maart\n\u2022 Piet \u2014 4 uur plukken \u2014 Luisweg \u2014 15 september',
    tips: [
      'Handig voor loonberekeningen en planning',
      'Koppel uren aan percelen voor een compleet kostenoverzicht per perceel',
    ],
    samenhang: [
      'Perceelkoppeling via \u2192 Percelen',
      'Activiteiten relateren aan \u2192 Crop Care, Harvest Hub',
    ],
    relatedSections: ['percelen', 'spuitschrift', 'oogstregistratie'],
    keywords: ['team', 'taken', 'uren', 'medewerkers', 'planning', 'loon'],
    route: '/team-tasks',
  },
  {
    id: 'seizoenswijzer',
    title: 'Seizoenswijzer',
    parentLabel: 'Research Hub',
    icon: BookOpen,
    shortDescription: 'Dynamische seizoenskalender afgestemd op jouw bloeidatum.',
    wat: 'Dynamische seizoenskalender die toont welke acties wanneer relevant zijn, afgestemd op jouw bloeidatum. Gepersonaliseerd advies per fenologische fase.',
    hoeWerktHet: [
      'Gebaseerd op fenologische fases (knopstadium \u2192 bloei \u2192 vruchtzetting \u2192 etc.)',
      'Toont per fase welke ziekten/plagen actueel zijn en welke acties je moet ondernemen',
      'Gepersonaliseerd op basis van jouw ingestelde bloeidatum',
    ],
    voorbeeld: 'Bij bloeidatum 15 april:\n\u2022 Fase "Muizenoor" (eind maart): Start schurftprogramma, eerste Captan-bespuiting\n\u2022 Fase "Roze knop": Let op meeldauw, overweeg Nimrod\n\u2022 Fase "Volle bloei": Geen bespuiting met insecticiden (bijen!)',
    tips: [
      'Stel je bloeidatum in voor gepersonaliseerde adviezen',
      'Check de Seizoenswijzer wekelijks tijdens het groeiseizoen',
    ],
    samenhang: [
      'Adviesproducten linken naar \u2192 Kennisbank (achtergrondinfo)',
      'Adviesproducten linken naar \u2192 Database Gewasbescherming (toelatingen)',
      'Actieknop "Registreer bespuiting" linkt naar \u2192 Slimme Invoer',
    ],
    relatedSections: ['kennisbank', 'database-gewasbescherming', 'slimme-invoer'],
    keywords: ['seizoen', 'kalender', 'bloei', 'fenologie', 'fase', 'advies', 'timing'],
    route: '/research?tab=signals',
  },
  {
    id: 'kennisbank',
    title: 'Kennisbank',
    parentLabel: 'Research Hub',
    icon: Library,
    shortDescription: 'Encyclopedie met factsheets over ziekten, plagen en teelttechnieken.',
    wat: 'Encyclopedie met factsheets over ziekten, plagen en teelttechnieken in de fruitteelt. Je naslagwerk voor alles over gewasbescherming.',
    hoeWerktHet: [
      'Doorzoekbaar op naam of categorie',
      'Per ziekte/plaag: beschrijving, symptomen, bestrijdingsstrategie, aanbevolen middelen',
      'Rasgevoeligheid: welke rassen zijn gevoeliger voor welke ziekte',
    ],
    voorbeeld: 'Zoek "schurft" \u2192 Factsheet Vruchtboomschurft:\n\u2022 Symptomen, infectieomstandigheden\n\u2022 Bestrijdingsstrategie per fase\n\u2022 Aanbevolen middelen met doseringen\n\u2022 Rasgevoeligheid: Elstar zeer gevoelig, Topaz resistent',
    tips: [
      'Gebruik de Kennisbank als naslagwerk bij het plannen van je bespuitingsprogramma',
      'Check rasgevoeligheid om te bepalen welke percelen extra aandacht nodig hebben',
    ],
    samenhang: [
      'Aanbevolen middelen verwijzen naar \u2192 Database Gewasbescherming',
      'Ziekte-info wordt gebruikt in \u2192 Seizoenswijzer',
    ],
    relatedSections: ['database-gewasbescherming', 'seizoenswijzer'],
    keywords: ['kennisbank', 'ziekten', 'plagen', 'factsheet', 'bestrijding', 'symptomen', 'encyclopedie'],
    route: '/research/kennisbank',
  },
  {
    id: 'veldklimaat',
    title: 'Veldklimaat',
    parentLabel: 'Weather Hub',
    icon: CloudSun,
    shortDescription: 'Weerdata en -voorspellingen specifiek voor jouw locatie en teelt.',
    wat: 'Weerdata en -voorspellingen specifiek voor jouw locatie en teelt. Weet precies wanneer je kunt spuiten en wanneer niet.',
    hoeWerktHet: [
      'Actueel weer, temperatuur, neerslag en wind',
      'Multi-model weervoorspellingen',
      'Neerslagradar via Buienradar',
      'Relevant voor spuitmomenten: wanneer is het droog en windstil genoeg?',
    ],
    voorbeeld: 'Veldklimaat toont: "Vandaag droog tot 15:00, wind NO 2 Bft. Goed spuitmoment."\nMorgen: "Regen vanaf 08:00, niet geschikt voor bespuiting."',
    tips: [
      'Check Veldklimaat altijd v\u00f3\u00f3r een bespuiting',
      'Let op de bladnatperiode \u2014 belangrijk voor schurftinfectie',
    ],
    samenhang: [
      'Weer-alerts linken naar \u2192 Seizoenswijzer (wanneer actie nodig)',
      'Spuitbeslissingen neem je op basis van \u2192 Veldklimaat + Seizoenswijzer',
    ],
    relatedSections: ['seizoenswijzer'],
    keywords: ['weer', 'klimaat', 'temperatuur', 'neerslag', 'wind', 'spuiten', 'buienradar', 'forecast'],
    route: '/weather/dashboard',
  },
];

// Helper to get a section by ID
export function getWegwijzerSection(id: string): WegwijzerSection | undefined {
  return wegwijzerSections.find((s) => s.id === id);
}

// Helper to search sections by keyword
export function searchWegwijzerSections(query: string): WegwijzerSection[] {
  const lower = query.toLowerCase();
  return wegwijzerSections.filter(
    (s) =>
      s.title.toLowerCase().includes(lower) ||
      s.shortDescription.toLowerCase().includes(lower) ||
      s.keywords.some((k) => k.toLowerCase().includes(lower)) ||
      s.wat.toLowerCase().includes(lower)
  );
}

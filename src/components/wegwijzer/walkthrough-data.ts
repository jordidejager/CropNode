import type { WalkthroughStepperProps } from './WalkthroughStepper';

type WalkthroughData = Pick<WalkthroughStepperProps, 'id' | 'title' | 'description' | 'steps' | 'autoPlay'>;

export const walkthroughsBySection: Record<string, WalkthroughData> = {
  'slimme-invoer': {
    id: 'walkthrough-slimme-invoer',
    title: 'Registratie invoeren',
    description: 'Stap voor stap een bespuiting registreren via Slimme Invoer.',
    steps: [
      {
        title: 'Open Slimme Invoer',
        description: 'Ga naar Command Center en klik op Slimme Invoer in het menu.',
        media: '/wegwijzer/slimme-invoer/stap-1-open-invoer.webp',
        mediaType: 'image',
        annotations: [
          {
            id: 'si-1-menu',
            label: 'Slimme Invoer 2.0',
            x: 12,
            y: 28,
            type: 'pointer',
          },
        ],
      },
      {
        title: 'Typ je registratie',
        description:
          "Typ in het invoerveld wat je hebt gespoten, bijvoorbeeld: 'Vandaag Captan 2kg op Elstar en Conference'",
        media: '/wegwijzer/slimme-invoer/stap-2-typ-registratie.webp',
        mediaType: 'image',
        annotations: [
          {
            id: 'si-2-input',
            label: 'Invoerveld',
            x: 24,
            y: 80,
            type: 'highlight-area',
            width: 42,
            height: 11,
          },
        ],
      },
      {
        title: 'AI herkent je invoer',
        description:
          'CropNode herkent automatisch het product, de dosering en de percelen. Je ziet een overzicht van wat er geparsed is.',
        media: '/wegwijzer/slimme-invoer/stap-3-ai-parsing.webp',
        mediaType: 'image',
        annotations: [
          {
            id: 'si-3-product',
            label: 'Middelen',
            x: 82,
            y: 43,
            type: 'numbered',
          },
          {
            id: 'si-3-dosering',
            label: 'Dosering',
            x: 93,
            y: 50,
            type: 'numbered',
          },
          {
            id: 'si-3-perceel',
            label: 'Percelen',
            x: 82,
            y: 72,
            type: 'numbered',
          },
        ],
      },
      {
        title: 'Controleer en bevestig',
        description:
          "Controleer de gegevens en klik op 'Bevestigen'. De bespuiting verschijnt direct in je Spuitschrift.",
        media: '/wegwijzer/slimme-invoer/stap-4-bevestiging.webp',
        mediaType: 'image',
        annotations: [
          {
            id: 'si-4-bevestig',
            label: 'Bevestigen',
            x: 90,
            y: 94,
            type: 'pointer',
          },
        ],
      },
    ],
  },

  percelen: {
    id: 'walkthrough-perceel-toevoegen',
    title: 'Nieuw perceel aanmaken',
    description: 'Stap voor stap een perceel toevoegen aan je bedrijf.',
    steps: [
      {
        title: 'Ga naar Percelen',
        description: "Klik op 'Percelen' in het hoofdmenu.",
        media: '/wegwijzer/perceel-toevoegen/stap-1-navigeer.webp',
        mediaType: 'image',
      },
      {
        title: "Klik op 'Perceel toevoegen'",
        description: "Klik rechtsboven op de knop 'Perceel toevoegen'.",
        media: '/wegwijzer/perceel-toevoegen/stap-2-perceel-toevoegen.webp',
        mediaType: 'image',
      },
      {
        title: 'Vul de gegevens in',
        description:
          'Geef het perceel een naam, het oppervlakte en optioneel een locatie op de kaart.',
        media: '/wegwijzer/perceel-toevoegen/stap-3-gegevens-invullen.webp',
        mediaType: 'image',
        annotations: [
          {
            id: 'pt-3-naam',
            label: 'Naam',
            x: 83,
            y: 43,
            type: 'numbered',
          },
          {
            id: 'pt-3-opp',
            label: 'Oppervlakte',
            x: 83,
            y: 50,
            type: 'numbered',
          },
          {
            id: 'pt-3-locatie',
            label: 'Locatie',
            x: 83,
            y: 59,
            type: 'numbered',
          },
        ],
      },
      {
        title: 'Perceel opgeslagen',
        description:
          'Na opslaan verschijnt het perceel in je overzicht en is het beschikbaar in de Slimme Invoer.',
        media: '/wegwijzer/perceel-toevoegen/stap-4-opgeslagen.webp',
        mediaType: 'image',
      },
    ],
  },

  spuitschrift: {
    id: 'walkthrough-spuitschrift',
    title: 'Registratie bekijken',
    description: 'Hoe je bespuitingen terugvindt en filtert in het Spuitschrift.',
    steps: [
      {
        title: 'Open het Spuitschrift',
        description: 'Ga naar Crop Care → Spuitschrift om al je bespuitingen te zien.',
        media: '/wegwijzer/spuitschrift/stap-1-open-spuitschrift.webp',
        mediaType: 'image',
      },
      {
        title: 'Filter op periode of perceel',
        description:
          'Gebruik de filters bovenaan om bespuitingen te filteren op datum, perceel of product.',
        media: '/wegwijzer/spuitschrift/stap-2-filter.webp',
        mediaType: 'image',
        annotations: [
          {
            id: 'ss-2-filter',
            label: 'Filterbalk',
            x: 27,
            y: 27,
            type: 'highlight-area',
            width: 70,
            height: 14,
          },
        ],
      },
      {
        title: 'Bekijk de details',
        description:
          'Klik op een registratie om alle details te zien: producten, doseringen, percelen en het weer op dat moment.',
        media: '/wegwijzer/spuitschrift/stap-3-details.webp',
        mediaType: 'image',
      },
    ],
  },
};

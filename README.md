# AgriSprayer Pro - Applicatie Documentatie

AgriSprayer Pro is een moderne webapplicatie, gebouwd met Next.js, TypeScript en Firebase. Het is ontworpen om het registratieproces van gewasbeschermingsmiddelen voor agrarische bedrijven te stroomlijnen. De kern van de applicatie is de "Slimme Invoer", een functionaliteit die gebruikmaakt van Generative AI (Google Gemini) om spuitregistraties in natuurlijke taal om te zetten naar gestructureerde, gevalideerde data.

---

## Overzicht van de Pagina's

De applicatie is opgebouwd uit verschillende modules, elk toegankelijk via het zijmenu.

### 1. Slimme Invoer & Recent Logboek (`/`)

Dit is de startpagina en het commandocentrum van de applicatie.

-   **Slimme Invoer:** Een minimalistische interface waar de gebruiker in een tekstveld een bespuiting kan omschrijven (bijv. "vandaag alle conference peren gespoten met 1.5 kg captan en 0.5 liter zwavel").
    -   **Asynchrone Verwerking:** Bij het indienen wordt de invoer direct opgeslagen en in de 'Recent Logboek'-tabel geplaatst met de status `Analyseren...`. De AI-analyse gebeurt op de achtergrond, zodat de gebruiker direct een nieuwe invoer kan doen.
-   **Recent Logboek:** Een tabel met alle ingevoerde bespuitingen, inclusief de regels die nog verwerkt worden of fouten bevatten.
    -   **Statussen:** `Analyseren...` (bezig met AI-verwerking), `Te Controleren` (AI-analyse voltooid, maar er is een validatiewaarschuwing, bijv. dosering te hoog), `Akkoord` (succesvol geanalyseerd en gevalideerd), `Fout` (de AI-analyse is mislukt).
    -   **Acties:** Gebruikers kunnen regels bewerken, verwijderen of een mislukte analyse opnieuw proberen.

### 2. Percelen (`/percelen`)

Een overzichtspagina voor het beheren van alle percelen van het bedrijf.

-   **Functionaliteit:** Volledige CRUD (Create, Read, Update, Delete) voor percelen.
-   **Gegevens:** Per perceel worden de naam, het gewas (bv. Appel, Peer), het ras (bv. Elstar, Conference) en de oppervlakte in hectare vastgelegd.

### 3. MiddelMatrix (`/middelmatrix`)

Een doorzoekbare database van alle toegelaten gewasbeschermingsmiddelen.

-   **Import:** De data voor deze matrix wordt geïmporteerd uit een officieel Excel-bestand van het CTGB (College voor de toelating van gewasbeschermingsmiddelen en biociden).
-   **Gegevens:** Bevat alle relevante informatie per middel, zoals de officiële naam, het toelatingsnummer, werkzame stoffen, en het toepassingsgebied (op welke gewassen het mag worden gebruikt) en de maximale dosering.
-   **Functie:** Dient als de "bron van waarheid" voor de validatie van spuitregistraties.

### 4. Spuitschrift (`/spuitschrift`)

Het officiële, digitale spuitregister van het bedrijf.

-   **Inhoud:** Toont alleen logboekregels die de status `Akkoord` hebben. Dit is het definitieve, gevalideerde overzicht van alle bespuitingen.
-   **Weergaves:**
    -   **Chronologisch:** Een lijst van alle bespuitingen, gesorteerd op datum, met details over de gebruikte middelen, doseringen en de bespoten percelen.
    -   **Per Perceel:** Een dropdown om een specifiek perceel te selecteren en de volledige spuithistorie van dat ene perceel te bekijken.

### 5. Voorraad (`/voorraad`)

Een module voor voorraadbeheer van de gewasbeschermingsmiddelen.

-   **Overzicht:** Toont de huidige voorraad van elk middel.
-   **Mutaties:**
    -   **Toevoegingen:** Gebruikers kunnen handmatig nieuwe leveringen (voorraad-toevoegingen) registreren.
    -   **Verbruik:** De voorraad wordt automatisch verlaagd wanneer een spuitregistratie in het logboek de status `Akkoord` krijgt.
-   **Historie:** Per product kan een gedetailleerd overzicht van alle mutaties (toevoegingen en verbruik) worden opgevraagd.

---

## Opzet van de Database (Firestore)

De applicatie maakt gebruik van een NoSQL-database (Cloud Firestore) met de volgende collecties:

-   `logbook`:
    -   **Doel:** Slaat elke 'Slimme Invoer' op, inclusief de status van de verwerking.
    -   **Documenten:** Elk document is een spuitregistratie met velden als `rawInput`, `date`, `status`, `parsedData` (de JSON-output van de AI), en `validationMessage`.

-   `parcels`:
    -   **Doel:** Bevat alle informatie over de percelen van het bedrijf.
    -   **Documenten:** Elk document representeert één perceel met velden als `name`, `crop`, `variety`, en `area`.

-   `middelen`:
    -   **Doel:** De MiddelMatrix-database. Dient als bron voor validatie.
    -   **Documenten:** Elk document is een middel, met een flexibele structuur die de kolommen uit het geïmporteerde Excel-bestand weerspiegelt (bv. `Middelnaam`, `Toelatingsnummer`, `Maximum middeldosis`).

-   `parcelHistory`:
    -   **Doel:** Slaat de definitieve, genormaliseerde spuitgeschiedenis per perceel op.
    -   **Documenten:** Wordt gevuld wanneer een `logbook`-entry de status `Akkoord` krijgt. Een document bevat de details van één middel op één perceel voor een specifieke datum (`parcelId`, `product`, `dosage`, `date`). Deze collectie drijft de 'Per Perceel'-weergave in het Spuitschrift.

-   `inventoryMovements`:
    -   **Doel:** Registreert alle voorraadmutaties.
    -   **Documenten:** Elk document is een mutatie met velden als `productName`, `quantity` (positief voor toevoeging, negatief for verbruik), `unit`, `type` (`addition` of `usage`), `date`, en een `referenceId` die linkt naar de `logbook`-entry.

-   `userPreferences`:
    -   **Doel:** Slaat "zelflerende" correcties op.
    -   **Documenten:** Als een gebruiker een door de AI herkend product handmatig corrigeert (bijv. van "Captan Flow" naar "Captan 80 WDG"), wordt hier een voorkeur opgeslagen. De ID is de alias (bv. 'captan'), met een veld `preferred` ('Captan 80 WDG'). Dit helpt de AI in de toekomst betere keuzes te maken.

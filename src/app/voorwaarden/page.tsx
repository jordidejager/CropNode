'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

export default function VoorwaardenPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-300">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#020617]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo variant="horizontal" theme="dark" width={120} height={28} />
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        {/* Page header */}
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Algemene Voorwaarden & Privacybeleid
          </h1>
          <p className="text-slate-500 text-sm">
            Laatst bijgewerkt: 17 april 2026 &middot; De Jager Technology
          </p>
        </div>

        <div className="space-y-16 leading-relaxed">
          {/* ─── DEEL 1: ALGEMENE VOORWAARDEN ─── */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-6 pb-3 border-b border-white/[0.06]">
              Deel 1 — Algemene Voorwaarden
            </h2>

            <div className="space-y-8">
              <Article title="1. Definities">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong className="text-slate-200">CropNode</strong>: het Agriculture Intelligence Platform, aangeboden als Software-as-a-Service (SaaS) door De Jager Technology.</li>
                  <li><strong className="text-slate-200">Gebruiker</strong>: elke natuurlijke of rechtspersoon die een account aanmaakt en/of het platform gebruikt.</li>
                  <li><strong className="text-slate-200">Dienst</strong>: alle functionaliteiten van het CropNode-platform, waaronder maar niet beperkt tot registratie, perceelbeheer, weerdata, analytics en de WhatsApp-integratie.</li>
                  <li><strong className="text-slate-200">AI-functies</strong>: onderdelen die gebruik maken van kunstmatige intelligentie, waaronder Slimme Invoer, CropNode Assistent (WhatsApp) en AI Inzichten.</li>
                </ul>
              </Article>

              <Article title="2. Dienstverlening">
                <p>CropNode is een SaaS-platform voor gewasbeschermingsregistratie, perceelbeheer en bedrijfsanalyse, specifiek ontwikkeld voor de Nederlandse fruitteelt (appel- en perenteelt).</p>
                <p className="mt-2">De Jager Technology streeft naar een hoge beschikbaarheid van het platform, maar garandeert geen specifieke uptime. Gepland onderhoud wordt waar mogelijk vooraf gecommuniceerd. Het platform wordt aangeboden op basis van &ldquo;as is&rdquo; en &ldquo;as available&rdquo;.</p>
              </Article>

              <Article title="3. Account & toegang">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>De Gebruiker is verantwoordelijk voor het vertrouwelijk houden van inloggegevens.</li>
                  <li>Per account kunnen maximaal 5 WhatsApp-nummers worden gekoppeld.</li>
                  <li>Accounts mogen uitsluitend worden gebruikt voor legitieme agrarische bedrijfsdoeleinden.</li>
                  <li>De Jager Technology behoudt zich het recht voor om accounts op te schorten of te beëindigen bij misbruik, oneigenlijk gebruik of schending van deze voorwaarden.</li>
                </ul>
              </Article>

              <Article title="4. CTGB Validatie — Disclaimer">
                <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 mb-3">
                  <p className="text-amber-300/90 text-sm font-medium">Belangrijk: lees dit artikel zorgvuldig.</p>
                </div>
                <p>CropNode bevat een geautomatiseerde 6-staps CTGB-validatie die registraties toetst aan de officiële CTGB-database op toelating, dosering, spuitinterval, maximale seizoenstoepassingen, cumulatie van werkzame stoffen en veiligheidstermijn.</p>
                <p className="mt-2">Deze validatie is een <strong className="text-slate-200">hulpmiddel</strong> en vervangt niet de eigen verantwoordelijkheid van de Gebruiker. Hoewel De Jager Technology zich inspant om de productdatabase actueel te houden, kan geen garantie worden gegeven dat alle gegevens te allen tijde volledig, juist en up-to-date zijn.</p>
                <p className="mt-2">De Gebruiker blijft te allen tijde <strong className="text-slate-200">zelf verantwoordelijk</strong> voor de naleving van wet- en regelgeving met betrekking tot gewasbescherming. Bij twijfel dient altijd het officiële CTGB-register (<a href="https://toelatingen.ctgb.nl" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">toelatingen.ctgb.nl</a>) te worden geraadpleegd.</p>
              </Article>

              <Article title="5. AI-functies — Disclaimer">
                <p>Onderdelen van CropNode maken gebruik van kunstmatige intelligentie (Google Gemini) voor het herkennen en verwerken van natuurlijke taal, classificatie van veldnotities, extractie van grondmonstergegevens en het genereren van inzichten.</p>
                <p className="mt-2">AI-gegenereerde output kan <strong className="text-slate-200">fouten bevatten</strong>. De Gebruiker dient iedere AI-verwerkte registratie te controleren vóór bevestiging. De Jager Technology is niet aansprakelijk voor schade als gevolg van onjuiste AI-interpretatie.</p>
                <p className="mt-2">Weersverwachtingen, spuitvenster-adviezen en ziektedrukmodellering zijn gebaseerd op meteorologische modellen en wetenschappelijke methoden (Mills-tabel, PAM-model), maar zijn <strong className="text-slate-200">indicatief</strong> en geen garantie voor werkelijke veldomstandigheden.</p>
              </Article>

              <Article title="6. Aansprakelijkheid">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>De Jager Technology is niet aansprakelijk voor directe of indirecte schade als gevolg van het gebruik van CropNode, waaronder maar niet beperkt tot schade door onjuiste registraties, verkeerde doseringen, gemiste spuitvensters, of dataverlies.</li>
                  <li>De totale aansprakelijkheid van De Jager Technology is in alle gevallen beperkt tot het bedrag dat de Gebruiker in de voorafgaande 12 maanden aan abonnementskosten heeft betaald.</li>
                  <li>De Gebruiker vrijwaart De Jager Technology voor aanspraken van derden die voortvloeien uit het gebruik van het platform door de Gebruiker.</li>
                </ul>
              </Article>

              <Article title="7. Intellectueel eigendom">
                <p>Alle intellectuele eigendomsrechten op het CropNode-platform, de software, het ontwerp, de documentatie en de onderliggende algoritmen berusten bij De Jager Technology. De Gebruiker verkrijgt uitsluitend een niet-exclusief, niet-overdraagbaar gebruiksrecht voor de duur van het abonnement.</p>
                <p className="mt-2">De data die de Gebruiker invoert (registraties, perceelgegevens, foto&apos;s, etc.) blijft eigendom van de Gebruiker.</p>
              </Article>

              <Article title="8. Abonnement & betaling">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>CropNode biedt drie abonnementsvormen: Gratis, Basis (€10/maand) en Pro (€25/maand), exclusief BTW.</li>
                  <li>Betaling geschiedt maandelijks vooraf.</li>
                  <li>Het abonnement is op elk moment opzegbaar. Na opzegging blijft het abonnement actief tot het einde van de lopende betaalperiode.</li>
                  <li>Er vindt geen restitutie plaats bij tussentijdse opzegging.</li>
                  <li>De Jager Technology behoudt zich het recht voor om de functionaliteiten en limieten van het gratis abonnement te wijzigen.</li>
                </ul>
              </Article>

              <Article title="9. Wijzigingen">
                <p>De Jager Technology kan deze voorwaarden wijzigen. Wezenlijke wijzigingen worden minimaal 30 dagen vooraf per e-mail aan de Gebruiker medegedeeld. Voortgezet gebruik van het platform na inwerkingtreding van de wijzigingen geldt als acceptatie.</p>
              </Article>

              <Article title="10. Toepasselijk recht">
                <p>Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement van de vestigingsplaats van De Jager Technology.</p>
              </Article>
            </div>
          </section>

          {/* ─── DEEL 2: PRIVACYBELEID ─── */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-6 pb-3 border-b border-white/[0.06]">
              Deel 2 — Privacybeleid
            </h2>

            <div className="space-y-8">
              <Article title="11. Verwerkingsverantwoordelijke">
                <p>De Jager Technology is verwerkingsverantwoordelijke in de zin van de Algemene Verordening Gegevensbescherming (AVG) voor de verwerking van persoonsgegevens via CropNode.</p>
                <p className="mt-2">Contact: <a href="mailto:admin@dejagertechnology.com" className="text-emerald-400 hover:underline">admin@dejagertechnology.com</a></p>
              </Article>

              <Article title="12. Welke gegevens worden verzameld">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm mt-2">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-left">
                        <th className="py-2 pr-4 text-slate-400 font-medium">Categorie</th>
                        <th className="py-2 pr-4 text-slate-400 font-medium">Gegevens</th>
                        <th className="py-2 text-slate-400 font-medium">Doel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Account</td>
                        <td className="py-2.5 pr-4">Naam, e-mail, bedrijfsnaam, wachtwoord (gehasht)</td>
                        <td className="py-2.5">Authenticatie & identificatie</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Percelen</td>
                        <td className="py-2.5 pr-4">Locatie (coördinaten), gewas, ras, oppervlakte</td>
                        <td className="py-2.5">Perceelbeheer & registratie</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Registraties</td>
                        <td className="py-2.5 pr-4">Spuitregistraties, bemesting, doseringen, data</td>
                        <td className="py-2.5">Spuitschrift & compliance</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Oogst & opslag</td>
                        <td className="py-2.5 pr-4">Oogstcijfers, koelceldata, sorteringen</td>
                        <td className="py-2.5">Productie & analytics</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">WhatsApp</td>
                        <td className="py-2.5 pr-4">Telefoonnummer, berichtinhoud, foto&apos;s</td>
                        <td className="py-2.5">CropNode Assistent</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Veldnotities</td>
                        <td className="py-2.5 pr-4">Tekst, foto&apos;s, GPS-locatie</td>
                        <td className="py-2.5">Veldobservaties</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Urenregistratie</td>
                        <td className="py-2.5 pr-4">Werkuren, taken, personeelsaantallen</td>
                        <td className="py-2.5">Arbeidsbeheer</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Weerdata</td>
                        <td className="py-2.5 pr-4">Locatie-gebonden weergegevens</td>
                        <td className="py-2.5">Forecast & spuitvenster</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Bodemanalyse</td>
                        <td className="py-2.5 pr-4">Geüploade PDF&apos;s (Eurofins), geëxtraheerde waarden</td>
                        <td className="py-2.5">Bemestingsadvies</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Article>

              <Article title="13. Derde partijen & verwerkers">
                <p>CropNode maakt gebruik van de volgende derde partijen voor het leveren van de dienst:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm mt-3">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-left">
                        <th className="py-2 pr-4 text-slate-400 font-medium">Dienst</th>
                        <th className="py-2 pr-4 text-slate-400 font-medium">Doel</th>
                        <th className="py-2 text-slate-400 font-medium">Locatie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Supabase</td>
                        <td className="py-2.5 pr-4">Database, authenticatie, bestandsopslag</td>
                        <td className="py-2.5">EU (Frankfurt)</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Google (Gemini AI)</td>
                        <td className="py-2.5 pr-4">AI-parsing, classificatie, embeddings</td>
                        <td className="py-2.5">EU/VS</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Meta (WhatsApp Cloud API)</td>
                        <td className="py-2.5 pr-4">WhatsApp-berichten verzenden/ontvangen</td>
                        <td className="py-2.5">EU/VS</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Vercel</td>
                        <td className="py-2.5 pr-4">Hosting & deployment</td>
                        <td className="py-2.5">EU (Frankfurt)</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">Open-Meteo</td>
                        <td className="py-2.5 pr-4">Weerdata (geen persoonsgegevens)</td>
                        <td className="py-2.5">EU</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-slate-200">PDOK</td>
                        <td className="py-2.5 pr-4">Perceelgrenzen & luchtfoto&apos;s (publieke data)</td>
                        <td className="py-2.5">NL</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm">Voor de verwerking door Google Gemini geldt dat berichtinhoud (bijv. gesproken bespuitingen) naar Google-servers wordt gestuurd voor AI-verwerking. Google Gemini API-data wordt niet gebruikt voor modeltraining conform het Google Cloud Data Processing Agreement.</p>
              </Article>

              <Article title="14. Rechtsgrond">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong className="text-slate-200">Uitvoering van de overeenkomst</strong> (art. 6 lid 1 sub b AVG): het verwerken van account- en bedrijfsgegevens is noodzakelijk voor het leveren van de dienst.</li>
                  <li><strong className="text-slate-200">Gerechtvaardigd belang</strong> (art. 6 lid 1 sub f AVG): het verbeteren van AI-nauwkeurigheid op basis van geanonimiseerde gebruikspatronen.</li>
                </ul>
              </Article>

              <Article title="15. Bewaartermijn">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Accountgegevens worden bewaard zolang het account actief is.</li>
                  <li>Na verwijdering van het account worden persoonsgegevens binnen 30 dagen verwijderd.</li>
                  <li>Spuitregistraties worden conform wettelijke vereisten minimaal 3 jaar bewaard (Wet gewasbeschermingsmiddelen en biociden).</li>
                  <li>WhatsApp-berichtenlogboek wordt 90 dagen bewaard voor foutopsporing, daarna geanonimiseerd.</li>
                </ul>
              </Article>

              <Article title="16. Rechten van de betrokkene">
                <p>Op grond van de AVG heeft de Gebruiker de volgende rechten:</p>
                <ul className="list-disc pl-5 space-y-1.5 mt-2">
                  <li><strong className="text-slate-200">Inzage</strong> — opvragen welke gegevens wij verwerken.</li>
                  <li><strong className="text-slate-200">Correctie</strong> — onjuiste gegevens laten aanpassen.</li>
                  <li><strong className="text-slate-200">Verwijdering</strong> — account en gegevens laten verwijderen (beschikbaar via Instellingen of per e-mail).</li>
                  <li><strong className="text-slate-200">Dataportabiliteit</strong> — export van data in machineleesbaar formaat (CSV-export is beschikbaar in het platform).</li>
                  <li><strong className="text-slate-200">Bezwaar</strong> — bezwaar maken tegen verwerking op basis van gerechtvaardigd belang.</li>
                  <li><strong className="text-slate-200">Klacht</strong> — een klacht indienen bij de Autoriteit Persoonsgegevens (<a href="https://autoriteitpersoonsgegevens.nl" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">autoriteitpersoonsgegevens.nl</a>).</li>
                </ul>
                <p className="mt-3">Verzoeken kunnen worden gericht aan <a href="mailto:admin@dejagertechnology.com" className="text-emerald-400 hover:underline">admin@dejagertechnology.com</a>. Wij reageren binnen 30 dagen.</p>
              </Article>

              <Article title="17. Cookies">
                <p>CropNode gebruikt uitsluitend <strong className="text-slate-200">functionele cookies</strong> voor authenticatie (Supabase Auth sessie-cookies). Er worden geen tracking-, analytische of marketing-cookies geplaatst. Hiervoor is geen toestemming vereist.</p>
              </Article>

              <Article title="18. Beveiliging">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Alle communicatie verloopt via HTTPS/TLS.</li>
                  <li>Wachtwoorden worden gehasht opgeslagen (bcrypt).</li>
                  <li>Database-toegang is beveiligd met Row Level Security (RLS) — gebruikers kunnen uitsluitend eigen data benaderen.</li>
                  <li>WhatsApp-webhooks worden geverifieerd met HMAC-SHA256 signature.</li>
                  <li>API-sleutels en gevoelige gegevens worden opgeslagen als versleutelde omgevingsvariabelen.</li>
                </ul>
              </Article>

              <Article title="19. Datalekken">
                <p>In geval van een datalek dat risico&apos;s voor de rechten en vrijheden van betrokkenen oplevert, meldt De Jager Technology dit binnen 72 uur aan de Autoriteit Persoonsgegevens en informeert de getroffen Gebruikers onverwijld.</p>
              </Article>
            </div>
          </section>

          {/* Contact */}
          <section className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-white mb-2">Vragen?</h3>
            <p className="text-slate-400 text-sm mb-4">
              Heb je vragen over deze voorwaarden of het privacybeleid? Neem contact op:
            </p>
            <div className="space-y-1 text-sm">
              <p><span className="text-slate-500">E-mail:</span>{' '}<a href="mailto:admin@dejagertechnology.com" className="text-emerald-400 hover:underline">admin@dejagertechnology.com</a></p>
              <p><span className="text-slate-500">Bedrijf:</span>{' '}<span className="text-slate-300">De Jager Technology</span></p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <span className="text-xs text-slate-600">&copy; {new Date().getFullYear()} De Jager Technology</span>
          <Link href="/" className="text-xs text-slate-600 hover:text-emerald-400 transition-colors">
            Terug naar CropNode
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Article({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article>
      <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
      <div className="text-slate-400 text-[15px] leading-relaxed">{children}</div>
    </article>
  );
}

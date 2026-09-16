# PRD — LED CO2-scherm (ingebouwd infopaneel)

**Status:** Concept — v1 scope
**Auteur:** Samuel (product) + Claude (co-auteur)
**Datum:** 2026-09-16
**Repo:** In-limbo

---

## 1. Probleemstelling

In Limbo berekent vandaag al hoeveel CO2 er bespaard wordt door hergebruik van
materiaal via het platform (`backend/impact.py`, endpoints in
`backend/routes/impact.py`), maar dat cijfer is enkel zichtbaar voor wie actief
naar `/impact-methodologie` navigeert of een jaarverslag opvraagt. Er is geen
**fysieke, altijd-actuele weergave** van dat cijfer op een plek waar bezoekers
het gewoon zien staan — bv. in het magazijn of de inkomhal, ingebouwd in een
infopaneel met begeleidende tekst eromheen, op zo'n 1,5m kijkafstand.

Dit voorstel beschrijft een **klein, budgetvriendelijk LED-scherm** (ESP32 +
MAX7219-dot-matrixmodules) dat autonoom, zonder permanent bemande computer of
browser, het actuele CO2-cijfer ophaalt en toont.

## 2. Doel & succescriteria

1. Het scherm toont het actuele **CO2 bespaard dit jaar (YTD)**, automatisch
   ververst, zonder dat iemand het manueel moet bijwerken.
2. Een wijziging op het platform (checkout/transfer) is **binnen ~5 minuten**
   zichtbaar op het scherm.
3. Bij een tijdelijk netwerk-/backendprobleem blijft het scherm het **laatst
   bekende cijfer** tonen (met een subtiele "niet live"-indicator) — geen lege
   of foutieve weergave voor bezoekers die het paneel bekijken.
4. **Geen enkele wijziging** aan de bestaande In Limbo-webapplicatie nodig —
   het scherm hergebruikt een reeds bestaand, publiek endpoint.
5. Totale hardwarekost blijft binnen het afgesproken budget (§10, ±€30-45).

**Niet-doel voor v1**: een historiek/trendgrafiek, meerdere afwisselende
cijfers, remote monitoring/logging, of OTA-firmware-updates — v1 toont precies
één statisch getal en wordt bij firmwarewijzigingen gewoon opnieuw via USB-C
geflasht.

## 3. Scope

Dit PRD beschrijft een **fysiek, extern apparaat** — geen wijziging aan de
In Limbo-codebase zelf:

- **Geen backend-wijziging**: het bestaande, publieke
  `GET /api/impact/platform/ytd` (`backend/routes/impact.py:40`) wordt exact
  hergebruikt zoals het vandaag al werkt.
- **Geen frontend-wijziging.**
- **Wel nieuw**: een los firmware-project (buiten deze repo, zie §9) dat op
  het fysieke toestel draait.

## 4. Gekozen databron & metriek

| | |
|---|---|
| Endpoint | `GET /api/impact/platform/ytd` — publiek, geen authenticatie nodig |
| Veld | `totalCo2Kg` (float, kg CO2-eq bespaard sinds 1 januari van het huidige kalenderjaar) |
| Waarom YTD i.p.v. het lifetime-totaal (`/api/impact/platform`) | toont recente inzet i.p.v. een cijfer dat enkel maar groeit — sluit aan bij de "vandaag sinds begin van het jaar"-insteek die ook al op `/impact-methodologie` gebruikt wordt |
| Weergaveformat | geheel getal, duizendtal-gescheiden met punt (bv. `4.567`), geen decimalen — past binnen het 7-cijferbudget (tot 9.999.999 kg) |

## 5. Hardware (definitieve keuze)

| Onderdeel | Keuze | Reden |
|---|---|---|
| Microcontroller | ESP32 WROOM DevKit, USB-C, CH340 | dual-core Xtensa, wifi ingebouwd, ruim voldoende GPIO's, goedkoop |
| Display | 2× MAX7219 4-in-1 dot-matrix module (rood), gechained → 64×8 pixels | genoeg breedte voor 7 leesbare cijfers op 1,5m, simpel 3-draads SPI-protocol, geen DMA/level shifter nodig |
| Interface | DIN/CLK/CS (bv. GPIO23/GPIO18/GPIO5 — controleer de pin-lay-out van je specifieke bordje, maar deze zijn vrij op de meeste WROOM-32 DevKits) | library `MD_MAX72XX`/`MD_Parola` |
| Voeding | USB-C 5V/2A-adapter, modules meegevoed via de 5V-pin van de ESP32 | volstaat ruim voor 2 sparse-content MAX7219-modules |
| Montage | soldeerverbindingen op stripboard i.p.v. losse dupont-kabels | permanente, trillingsvaste opstelling in een ingebouwd paneel |

Volledige onderdelenlijst + prijzen: zie §10.

## 6. Functionele requirements (firmware)

### 6.1 Wifi-verbinding
SSID/wachtwoord in een **niet-ingecheckte** `secrets.h` (analoog aan hoe dit
project `.env`-bestanden buiten git houdt) — automatische reconnect bij
verbroken verbinding, geen manuele herstart nodig.

### 6.2 Data ophalen
- Elke **5 minuten** (300.000 ms) een HTTPS GET naar
  `/api/impact/platform/ytd`.
- `client.setInsecure()` (geen certificaatvalidatie) — aanvaardbaar voor dit
  laag-risico, puur read-only endpoint (zie §12.2).
- Timeout: 10s.

### 6.3 Parsing
`ArduinoJson`, veld `totalCo2Kg` uitlezen, afronden naar een geheel getal,
formatteren met duizendtal-punten (bv. `4.567`).

### 6.4 Weergave
`MD_Parola`/`MD_MAX72XX`, **statisch** (niet scrollend) op de 64×8-matrix.
Vaste helderheid, ingesteld in de firmware-config (startwaarde bv. intensiteit
4/15 — na installatie ter plaatse finetunen op basis van het omgevingslicht).

### 6.5 Foutafhandeling
Bij een mislukte fetch (timeout, non-200, parse-fout): het scherm **blijft het
laatst succesvol opgehaalde cijfer tonen**. Een klein knipperend stipje (1
pixel in een hoek van de matrix) geeft aan dat de weergave "niet live" is
zolang de laatste fetch niet gelukt is. Geen aparte snelle-retry-logica in
v1 — gewoon de volgende normale 5-minuten-cyclus.

### 6.6 Opstartgedrag
Bij de allereerste boot (nog geen "laatst bekende waarde" beschikbaar) toont
het scherm `-------` totdat de eerste fetch lukt.

### 6.7 Stroomuitval/herstart
Bij stroomonderbreking herstart de ESP32 vanzelf, verbindt opnieuw met wifi,
en doorloopt opnieuw §6.6 — geen fysieke aan/uit-schakelaar of handmatige
tussenkomst nodig.

## 7. Niet-functionele requirements

- Firmwarecode zelf mag Engelstalige comments bevatten (gangbare
  Arduino/embedded-conventie); dit PRD-document blijft, zoals de rest van het
  project, in het Nederlands.
- Geen PII, geen user-tracking — het scherm haalt enkel het geaggregeerde
  platformcijfer op.
- Belasting op de backend: 1 request per 5 minuten vanaf één vast IP —
  verwaarloosbaar, geen aanpassing aan de bestaande `limiter`-configuratie
  nodig.

## 8. Datamodel/API — geen wijziging

Expliciet: **geen nieuwe backend-modellen, geen nieuwe routes.** Het enige
"contract" tussen scherm en platform is het bestaande responseformaat van
`GET /api/impact/platform/ytd` (`backend/routes/impact.py:40-63`). Een
toekomstige wijziging aan dat endpoint (veldnaam, structuur) zou de firmware
breken — vermeld hier als expliciete afhankelijkheid, niet als blokkade.

## 9. Betrokken bestanden/projecten

| Bestand/project | Wijziging |
|---|---|
| `backend/routes/impact.py` | **Geen wijziging** — enkel hergebruik van het bestaande endpoint |
| Nieuw, apart firmware-project (bv. `in-limbo-co2-display`, **buiten** deze repo) | Nieuw: Arduino/PlatformIO-sketch + niet-ingecheckte `secrets.h` voor wifi-credentials |
| `prd/PRD_led_co2_scherm.md` (dit document) | Nieuw |

## 10. Onderdelenlijst & budget (definitief)

| # | Onderdeel | Aantal | Indicatieprijs |
|---|---|---|---|
| 1 | ESP32 WROOM DevKit (USB-C, CH340) | 1× | €6-9 |
| 2 | MAX7219 4-in-1 dot-matrix module (rood) | 2× | €12-18 |
| 3 | Jumperkabels (dupont) | 1 set | €2-3 |
| 4 | USB-C-voeding 5V/2A | 1× | €8-12 |
| 5 | USB-C-kabel (indien niet meegeleverd) | 1× | €0-5 |
| 6 | Stripboard/perfboard | 1× | €2-4 |
| 7 | Krimpkous | — | €1-2 |

**Totaal: ±€30-45** (excl. eenmalige soldeerbout indien nog niet aanwezig).
Aanbevolen: alles in één bestelling bij bitsandparts.nl (waar zowel de ESP32
als de MAX7219-module al gevonden zijn) voor één keer verzendkosten.

## 11. Out of scope voor v1

- Historiek/trendgrafiek of meerdere afwisselende cijfers (bv. YTD + lifetime
  om beurt).
- OTA-firmware-updates — updates gebeuren via een USB-C-herflash.
- Remote monitoring/logging of een alert wanneer het scherm langdurig "niet
  live" staat.
- PIN/beveiliging op het toestel zelf.
- Automatische schaalconversie (bv. kg → ton) bij overflow van het
  7-cijferbudget.
- Tijdgebaseerd/automatisch dimmen — vaste helderheid volstaat.
- Meerdere schermen of synchronisatie tussen toestellen.

## 12. Aanvaarde risico's

1. **Cijferoverflow op lange termijn** — als het YTD-totaal ooit
   9.999.999 kg overschrijdt, past het niet meer in het 7-cijferbudget. Bij
   het huidige groeitempo geen probleem binnen afzienbare tijd; niet
   automatisch afgehandeld in v1 (zie §11) — te herzien zodra relevant.
2. **`client.setInsecure()`** (geen certificaatvalidatie op de HTTPS-call) —
   aanvaardbaar voor een puur read-only, publiek, laag-risico endpoint; er
   staat geen gevoelige data of schrijfactie op het spel.
3. **Wifi-credentials lokaal op het toestel** — fysieke toegang tot het
   apparaat zou in theorie het wifi-wachtwoord kunnen blootleggen (flash
   uitlezen). Aanvaard voor een intern netwerk-scenario.
4. **Geen alerting bij langdurige uitval** — enkel het knipperend stipje ter
   plaatse signaleert een probleem; niemand krijgt een melding als het toestel
   dagenlang geen verbinding zou hebben. Visuele controle ter plaatse volstaat
   voor v1.

## 13. Rollout-suggestie

1. Firmwarebasis: wifi-connectie + HTTPS-fetch + JSON-parse, geverifieerd via
   de seriële monitor (nog zonder display aangesloten).
2. `MD_Parola`/`MD_MAX72XX`-aansturing van de 2 gechainde MAX7219-modules,
   eerst met een vast testgetal.
3. Koppelen: opgehaalde `totalCo2Kg` formatteren en tonen, incl. de
   5-minuten-cyclus (§6.2-6.3).
4. Foutafhandeling + "niet live"-indicator + opstartgedrag (§6.5-6.7)
   toevoegen en testen (wifi tijdelijk uitzetten, backend tijdelijk
   onbereikbaar maken, stroom onderbreken).
5. Fysieke montage: bedrading solderen op stripboard, inbouwen in het paneel,
   helderheid ter plaatse finetunen.
6. Een week laten meedraaien op de definitieve locatie en het herstelgedrag
   na een netwerk-hik in de praktijk opvolgen vóór definitieve oplevering.

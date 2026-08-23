# PRD — Kiosk-modus (magazijn)

**Status:** Concept — v1 scope
**Auteur:** Samuel (product) + Claude (co-auteur)
**Datum:** 2026-08-23
**Repo:** In-limbo

---

## 1. Probleemstelling

In het magazijn komt een vaste kiosk (scherm, toetsenbord, muis, speakers) te
staan waarop bezoekers zelfstandig, zonder personeel dat meekijkt, vier dingen
moeten kunnen doen: materiaal uitchecken via de bestaande check-out-tool
(`/checkout`), de catalogus van aanbiedingen doorbladeren (`/catalogus`), het
spel "Schat of Schroot?" spelen (`/spel`), en de inspiratiepagina lezen
(`/inspiratie`). Al deze onderdelen bestaan al en zijn vandaag al publiek
toegankelijk — er is geen nieuwe *kernfunctionaliteit* nodig, maar wel een
**kiosk-geschikte manier om ze te ontsluiten**: een startpunt om vanuit te
kiezen, een simpele weg terug, een automatische schone-lei-reset zodat de ene
bezoeker niet in de sessie (of het spel-account) van de vorige terechtkomt, én
een manier voor het team om iets kwijt te kunnen aan wie er toevallig langs de
kiosk komt (een oproep voor hulp, een evenement, een mededeling) — zonder dat
daarvoor iemand fysiek een briefje moet ophangen.

## 2. Doel & succescriteria

1. **Eén duidelijk startpunt** — bezoekers die de kiosk benaderen zien meteen
   een overzichtelijk startmenu met de vier kiosk-taken (check-out, catalogus,
   spel, inspiratie), zonder dat ze eerst moeten weten waar die pagina's op de
   normale site staan.
2. **Vrij en zonder wrijving** — eenmaal gekozen, werkt elke pagina exact zoals
   op de gewone site (geen aangepaste layout, geen extra stappen, geen login
   vereist) — en bezoekers kunnen, als ze dat willen, ook gewoon verder over de
   site navigeren (bv. via de bestaande header) zoals elke andere bezoeker.
3. **Schone lei tussen bezoekers** — na 5 minuten inactiviteit (met een
   zichtbare aftelklok in de laatste 20 seconden) keert de kiosk automatisch
   terug naar het startmenu én worden eventuele ingelogde sessies (platform-
   account en/of spel-account) uitgelogd, zodat de volgende bezoeker altijd
   anoniem en bij het startmenu begint.
4. **Team kan communiceren naar de vloer** — een admin kan zonder ontwikkelaar
   een oproep voor hulp, evenement of mededeling op het kiosk-startmenu zetten
   en weer weghalen, en die verschijnt/verdwijnt op de kiosk zonder dat iemand
   het toestel moet herladen.
5. **Geen impact op de rest van de site** — bezoekers die de site normaal
   gebruiken (niet op het kiosk-toestel) merken helemaal niets van deze
   feature: geen nieuwe knoppen, geen gewijzigde layout, geen idle-timeout.

Niet-doel voor v1: een OS-/browser-niveau "echte" kioskvergrendeling (fullscreen
lock, uitschakelen van browser-chrome/dev tools/OS-toetsencombinaties). Dat is
een configuratie van het fysieke toestel, niet van de webapplicatie — zie §12.

## 3. Scope & toegang

Kiosk-modus is een **puur client-side, additieve laag** bovenop de bestaande,
al-publieke pagina's, aangevuld met één nieuwe, kleine backend-feature
(kiosk-mededelingen, §6.6). Geen van de vier kiosktaken vereist een login:

| Onderdeel | Route | Auth vandaag |
|---|---|---|
| Check-out | `/checkout` | Publiek (`backend/routes/checkout.py`: `"""Magazijn-checkout (publiek)."""`) |
| Catalogus | `/catalogus` | Publiek |
| Spel | `/spel` | Publiek, met eigen los account-systeem (`GameAuthContext`) enkel voor het spel zelf |
| Inspiratie | `/inspiratie` | Publiek |

Kiosk-modus **verandert niets** aan deze routes, hun layout, of hun
toegankelijkheid — en beperkt de navigatie ook niet tot enkel deze vier. Zodra
iemand op de kiosk bv. via de bestaande header naar `/over-ons` of `/login`
navigeert, werkt dat gewoon zoals altijd (expliciete wens: "vrij op de website
kunnen rondbewegen zoals dat is"). Kiosk-modus voegt enkel toe, zichtbaar
bovenop de bestaande UI:

1. Een nieuw startmenu (`/kiosk`), met bovenaan een banner voor actieve
   kiosk-mededelingen (§6.6).
2. Een kleine persistente "terug naar start"-knop + een idle-reset-mechanisme,
   **enkel actief wanneer kiosk-modus voor die browser is ingeschakeld**.
3. Eén nieuw admin-tabblad ("Kiosk") om die mededelingen te beheren — dat tabblad
   zelf is normale admin-UI, geen kiosk-chrome.

## 4. Fysieke opstelling & activatie van kiosk-modus

- Het kiosk-toestel is een **Raspberry Pi**, aangesloten op scherm, toetsenbord,
  muis en speakers, die opstart in een browser (bv. Chromium in
  `--kiosk`-modus/fullscreen) met `https://<domein>/kiosk` als vaste startpagina
  — dus telkens de Pi (her)opstart, laadt automatisch het kiosk-startmenu,
  zonder tussenkomst van personeel. Dit is een **infrastructuur-/OS-configuratie
  van de Pi** (autostart/browserinstellingen), geen applicatiecode — buiten
  scope van dit PRD om te bouwen, maar wel de expliciete aanname waarop de rest
  van dit document steunt (zie ook §12).
- Bij elk laden van `/kiosk` wordt een vlag lokaal opgeslagen
  (`localStorage.setItem('il_kiosk_mode', '1')`). Deze vlag bepaalt of de
  kiosk-chrome (§5) actief is — **per browser/toestel**, niet per account, niet
  server-side. Op de Pi wordt deze dus bij elke opstart opnieuw gezet (idempotent),
  maar de vlag blijft ook gewoon staan tussen paginabezoeken/herladingen door
  binnen diezelfde sessie (persistente `localStorage`, niet `sessionStorage`).
- Voor het geval de kiosk-URL toch los van de Pi in een gewone browser bezocht
  wordt (bv. door personeel dat wil testen): één bezoek aan `/kiosk` volstaat om
  dezelfde kiosk-chrome ook op dat toestel te activeren, zonder verdere setup.
- `/kiosk` wordt nergens gelinkt vanuit de normale site-navigatie (geen
  header-link) — het is een onvermelde URL, wat het risico beperkt dat een
  gewone bezoeker er per ongeluk in terechtkomt (zie ook §13, aanvaard risico).
- Kiosk-modus **uitschakelen** op dat toestel: zie §6.5.

## 5. Kiosk-chrome (wat wordt toegevoegd, enkel wanneer actief)

Wanneer `il_kiosk_mode` aan staat, komen er twee stukken UI bovenop de
bestaande site, beide los van de paginalayout (`position: fixed`, dus geen
herschikking van bestaande content — voldoet aan "geen aanpassing van
layout"):

1. **Startmenu** (`/kiosk`, nieuwe pagina) — bovenaan de mededelingen-banner
   (§6.6, enkel zichtbaar als er actieve berichten zijn), daaronder vier grote,
   duidelijke tegels/knoppen: "Check-out" (→ `/checkout`), "Catalogus"
   (→ `/catalogus`), "Speel het spel" (→ `/spel`), "Inspiratie"
   (→ `/inspiratie`). Opgebouwd met de bestaande shadcn/ui-primitives
   (`components/ui/button`, `card`, ...) zodat het visueel aansluit bij de rest
   van de site, geen eigen stijlsysteem.
2. **Zwevende "Terug naar start"-knop** — zichtbaar op elke pagina behalve
   `/kiosk` zelf, zolang kiosk-modus actief is. Klik → bevestiging ("Weet je het
   zeker? Eventuele voortgang gaat verloren.") → reset-routine (§6.4) → terug
   naar `/kiosk`.

## 6. Functionele requirements

### 6.1 Startmenu (`/kiosk`)
- Nieuwe route `/kiosk` → nieuwe pagina `frontend/src/pages/Kiosk.jsx`, publiek
  (geen `<ProtectedRoute>`, zelfde patroon als `/checkout`).
- Vier grote knoppen/tegels, elk navigeert naar de bestaande route
  (`/checkout`, `/catalogus`, `/spel`, `/inspiratie`) — geen wijziging aan die
  pagina's zelf.
- Zet bij het laden de `il_kiosk_mode`-vlag (idempotent, ook als hij al aan
  staat).
- Haalt bij het laden de actieve kiosk-mededelingen op (§6.6) voor de banner.

### 6.2 Zwevende terug-knop
- Nieuw component, bv. `frontend/src/components/kiosk/KioskReturnButton.jsx`,
  globaal gemount in `App.js` (naast `<Header/>`), rendert `null` tenzij
  `il_kiosk_mode` actief is én de huidige route niet `/kiosk` is.
- Bevestigingsdialoog vóór reset (voorkomt per-ongeluk-verlies van voortgang,
  bv. midden in de check-out-wizard).

### 6.3 Idle-timeout met aftelklok
- Actief **enkel** wanneer `il_kiosk_mode` aan staat.
- Luistert op document-niveau naar activiteit (`mousemove`, `keydown`, `click`,
  `touchstart`, `scroll`) en houdt een laatste-activiteit-tijdstip bij.
- Bij **280 seconden** (4 min 40 sec) inactiviteit: een full-screen overlay
  verschijnt met een zichtbare aftelklok van 20 naar 0 ("Nog daar? Terug naar
  het startmenu over 20…") en een duidelijke knop "Ik ben er nog" die de timer
  reset en de overlay sluit. Elke interactie (ook buiten die knop) sluit de
  overlay en herstart de klok.
- Bereikt de aftelklok 0 (dus **300 seconden**/5 minuten totale inactiviteit):
  reset-routine (§6.4) wordt uitgevoerd.
- Bij elke routewissel telt dat ook als activiteit (reset van de timer) — een
  bezoeker die actief doorklikt, wordt niet halverwege weggegooid.

### 6.4 Reset-routine
Wat er gebeurt bij zowel de handmatige "terug naar start"-knop als de
automatische idle-reset:
1. Best-effort uitloggen van een eventuele platform-sessie: hergebruik
   `logout()` uit `frontend/src/contexts/AuthContext.jsx` (bestaande
   `POST /auth/logout` + lokale state-reset) — voorkomt dat de volgende
   bezoeker in het account van de vorige terechtkomt.
2. Best-effort uitloggen van een eventuele spel-sessie: rechtstreeks
   `api.post('/game/logout')` (bestaand endpoint, zie `backend/game_auth.py`).
   Geen React-context nodig hiervoor — `GameAuthContext` is toch niet globaal
   gemount (enkel binnen `Game.jsx`), dus navigeren weg van `/spel` unmount die
   context sowieso; enkel de httpOnly-cookie moet server-side opgeruimd worden.
3. Navigeren naar `/kiosk`.
- Beide logout-calls zijn best-effort (fouten genegeerd, zelfde patroon als
  bestaande `logout()`-implementaties) — een netwerkfout mag de reset naar het
  startmenu niet blokkeren.
- Geen reset nodig van de check-out-wizardstate: die staat leeft alleen lokaal
  in `Checkout.jsx`-componentstate en verdwijnt vanzelf bij het unmounten
  (navigeren weg van `/checkout`).

### 6.5 Kiosk-modus uitschakelen
- Kleine, bewuste UI-actie op het startmenu (bv. een klein "···"-icoon in een
  hoek, of lang indrukken op het logo) opent een bevestigingsdialoog "Kiosk-
  modus uitschakelen op dit toestel?". Bevestigen wist `il_kiosk_mode` uit
  `localStorage` en navigeert naar `/` (normale landingspagina, kiosk-chrome
  meteen weg).
- Geen wachtwoord/PIN vereist (bewust — zie §11), enkel de extra tussenstap
  (menu openen + bevestigen) om per-ongeluk-uitschakelen door een gewone
  kioskgebruiker te vermijden.

### 6.6 Kiosk-mededelingen (banner + admin-beheer)
- Nieuw, **apart** concept van de bestaande "Meldingen" (admin-alerts, zie
  CLAUDE.md-sectie "Notificaties vs. Meldingen vs. Berichten" en
  `prd/PRD_meldingen_admin.md`) — kiosk-mededelingen gaan de andere richting
  op: een admin stuurt een boodschap **naar** de kioskbezoekers, geen signaal
  **naar** de admin. Om verwarring te vermijden consequent "kiosk-mededelingen"
  genoemd, nooit kortweg "meldingen".
- Drie types, gekozen bij het aanmaken, elk met een eigen icoon/kleur in de
  banner voor snelle herkenning:
  1. **Oproep voor hulp** (`hulp`)
  2. **Evenement** (`evenement`)
  3. **Algemene mededeling** (`mededeling`)
- Elk bericht bestaat uit: vrije tekst (max 300 tekens), het type, en een
  handmatige aan/uit-schakelaar (`active`). **Geen** start-/einddatum in v1 —
  de admin schakelt zelf uit wanneer een bericht niet meer relevant is (bv. na
  afloop van een evenement).
- Nieuw tabblad **"Kiosk"** in het admin-paneel
  (`frontend/src/pages/admin/AdminKiosk.jsx`), zelfde tab-patroon als de
  bestaande secties in `AdminPanel.jsx` (`SECTIONS`/`SECTION_TITLES`-arrays +
  sub-component, zie bv. `AdminMeldingen`/`AdminGame`): lijst van alle
  berichten (actief + inactief), met aanmaken, bewerken, aan/uit-zetten en
  verwijderen.
- Op het kiosk-startmenu: een **banner bovenaan**, boven de tegels, die enkel
  **actieve** berichten toont — één tegelijk, wisselend na een paar seconden
  (bv. elke 6s) als er meerdere actief zijn. Geen actieve berichten → banner
  blijft volledig weg (geen lege balk, geen layoutverschuiving).
- Het startmenu haalt de actieve berichten op bij het laden, en ververst ze
  periodiek (bv. elke 60s, zelfde pollingpatroon als de bestaande
  bell-badge/meldingenbadge in `AdminPanel.jsx`) zodat een bericht dat een
  admin net (de)activeert, ook verschijnt/verdwijnt zonder dat iemand het
  kiosk-toestel manueel moet herladen.

## 7. Datamodel (voorstel, aansluitend bij bestaande conventies in `backend/models.py`)

```python
# ---------- Kiosk-mededelingen ----------
KioskMessageType = Literal['hulp', 'evenement', 'mededeling']


class KioskMessageCreate(BaseModel):
    """Body voor POST /api/admin/kiosk/messages."""
    model_config = ConfigDict(str_strip_whitespace=True)
    type: KioskMessageType
    text: str = Field(..., min_length=1, max_length=300)
    active: bool = True


class KioskMessageUpdate(BaseModel):
    """Body voor PATCH /api/admin/kiosk/messages/{id} — alle velden optioneel."""
    model_config = ConfigDict(str_strip_whitespace=True)
    type: Optional[KioskMessageType] = None
    text: Optional[str] = Field(None, min_length=1, max_length=300)
    active: Optional[bool] = None


class KioskMessagePublic(BaseModel):
    id: str
    type: KioskMessageType
    text: str
    active: bool
    createdAt: str
    updatedAt: str
```

**Collectie:** `db.kiosk_messages` — plat document per bericht, analoog aan
`db.news` qua vorm en aan dezelfde `_serialize_*`/CRUD-stijl als
`backend/routes/news.py` (`authorId`, `createdAt`, `updatedAt` volgens
`now_iso()`/`uuid.uuid4()`-conventie uit `deps.py`). Geen wijziging aan
bestaande collecties nodig — dit is volledig los van `db.reports`
("Meldingen") en `db.notifications`.

## 8. API-routes (voorstel)

| Methode | Route | Toegang | Beschrijving |
|---|---|---|---|
| `GET` | `/api/kiosk/messages` | Publiek | Actieve berichten voor de kiosk-banner (enkel `active=true`, nieuwste eerst) — geen auth, zelfde niveau als `GET /organisations/search` |
| `GET` | `/api/admin/kiosk/messages` | Admin | Alle berichten (actief + inactief), voor het beheertabblad |
| `POST` | `/api/admin/kiosk/messages` | Admin | Nieuw bericht aanmaken |
| `PATCH` | `/api/admin/kiosk/messages/{id}` | Admin | Bericht bewerken (tekst/type/actief) |
| `DELETE` | `/api/admin/kiosk/messages/{id}` | Admin | Bericht verwijderen |

Nieuw routerbestand `backend/routes/kiosk.py`, gemount in `server.py` zoals de
overige routers (`app.include_router(kiosk.router, prefix="/api", ...)`).
Admin-routes achter `Depends(get_admin_user)`, zelfde patroon als
`routes/news.py`/`routes/checkin.py`. Geen nieuwe rate-limit-regels nodig
buiten de bestaande `limiter`-standaard.

## 9. Betrokken bestanden (voorstel)

| Bestand | Wijziging |
|---|---|
| `backend/routes/kiosk.py` | **Nieuw** — publieke + admin-routes voor kiosk-mededelingen (§8) |
| `backend/models.py` | **Nieuw** — `KioskMessageType`, `KioskMessageCreate`, `KioskMessageUpdate`, `KioskMessagePublic` (§7) |
| `backend/server.py` | Nieuwe router mounten naast de bestaande (`routes/kiosk.py`) |
| `frontend/src/pages/Kiosk.jsx` | **Nieuw** — startmenu (vier tegels + mededelingen-banner) |
| `frontend/src/contexts/KioskContext.jsx` | **Nieuw** — houdt `kioskActive`-state bij (leest/schrijft `localStorage`), bevat de idle-timer en de reset-routine (§6.4), geëxposeerd via een `useKiosk()`-hook |
| `frontend/src/components/kiosk/KioskReturnButton.jsx` | **Nieuw** — zwevende terug-knop (§6.2) |
| `frontend/src/components/kiosk/KioskIdleOverlay.jsx` | **Nieuw** — full-screen aftelklok-overlay (§6.3) |
| `frontend/src/components/kiosk/KioskMessageBanner.jsx` | **Nieuw** — wisselende banner met actieve mededelingen (§6.6) |
| `frontend/src/pages/admin/AdminKiosk.jsx` | **Nieuw** — admin-beheer van mededelingen (§6.6) |
| `frontend/src/pages/AdminPanel.jsx` | `SECTIONS`/`SECTION_TITLES` uitbreiden met `kiosk`-tabblad, `AdminKiosk` importeren/renderen |
| `frontend/src/App.js` | Route `/kiosk` toevoegen; `KioskProvider` + `KioskReturnButton` + `KioskIdleOverlay` globaal mounten (binnen `AuthProvider`, zodat `useAuth().logout()` beschikbaar is) |
| `frontend/src/locales/nl.json`, `fr.json` | Nieuwe strings voor startmenu, terug-knop, aftelklok-overlay, uitschakel-dialoog, mededelingen-banner + admin-beheerformulier (bestaande conventie: elke nieuwe string in beide bestanden) |

Geen wijzigingen aan `Checkout.jsx`, `Catalogus.jsx`, `Game.jsx`,
`Inspiratie.jsx`, `GameAuthContext.jsx`, `AuthContext.jsx`.

## 10. Niet-functionele requirements

- **Geen impact op reguliere bezoekers**: alle kiosk-chrome rendert
  voorwaardelijk op `kioskActive` — een browser die `/kiosk` nooit bezocht
  heeft, ziet geen enkel verschil met vandaag. De mededelingen-banner
  verschijnt enkel op `/kiosk` zelf, niet elders op de site.
- **Geluid**: geen nieuwe audio-implementatie. De bestaande spel-geluiden
  (`useGameSounds.js`, met aan/uit-toggle `SoundToggle.jsx`) blijven zoals ze
  zijn; de kiosk-speakers dienen daarvoor.
- **Toetsenbord/muis-bediening**: geen aparte "touch-modus" of UI-aanpassing
  nodig — de bestaande pagina's zijn al bruikbaar met toetsenbord/muis, en
  layoutwijzigingen zijn expliciet buiten scope.
- **Mededelingen blijven eenvoudig**: platte tekst, geen afbeeldingen/opmaak in
  v1 (zie §12).
- **Taal**: kiosk-strings volgen de bestaande i18next-opzet (nl + fr, nl
  leidend) — een bezoeker kan op de kiosk ook gewoon de taal wisselen via de
  bestaande taalkeuze in de header, net als op de rest van de site. Mededelingen
  zelf worden door de admin in één taal ingevoerd (geen aparte nl/fr-velden in
  v1, zie §12) — analoog aan hoe bestaande in-app-notificaties ook niet
  vertaald worden.

## 11. Privacy & overwegingen

- De idle-reset (§6.4) is zelf een privacybescherming: voorkomt dat een
  platform-account of spel-account van de ene bezoeker toegankelijk blijft voor
  de volgende op hetzelfde gedeelde toestel.
- Geen PII wordt opgeslagen door de kiosk-chrome zelf — de enige nieuwe lokaal
  opgeslagen data is de niet-persoonlijke vlag `il_kiosk_mode` in
  `localStorage`.
- `GET /api/kiosk/messages` is bewust **publiek/onbeveiligd**, net als
  `GET /organisations/search` — de inhoud is toch al bedoeld om op een scherm
  in het magazijn te tonen. Admins moeten zich ervan bewust zijn dat een
  mededeling geen interne/gevoelige informatie mag bevatten (dit is een
  redactionele richtlijn, geen technische beperking).
- Bewust **geen wachtwoord/PIN** om kiosk-modus te activeren of te
  deactiveren: dit is een UI-gemak-schakelaar, geen beveiligingsgrens — het
  toestel zelf (fysieke plaatsing in het magazijn) is de eigenlijke
  toegangscontrole. Het admin-tabblad om mededelingen te beheren zit wél al
  achter de bestaande admin-login (`Depends(get_admin_user)`).

## 12. Out of scope voor v1

- OS-/browser-niveau kioskvergrendeling op de Raspberry Pi zelf (autostart-
  configuratie, Chromium `--kiosk`-vlag/fullscreen, geblokkeerde
  toetsencombinaties, uitgeschakelde adresbalk/dev tools) — dit is een
  provisioning-/ops-taak op het fysieke toestel (§4), niet iets dat de webapp
  zelf kan afdwingen of dat in deze codebase gebouwd wordt.
- Het spel toevoegen aan de normale site-navigatie (header) — blijft, zoals
  vandaag, enkel bereikbaar via een directe link (nu ook via het kiosk-
  startmenu), niet via de hoofdnavigatie.
- Wachtwoord/PIN-beveiliging voor het activeren/deactiveren van kiosk-modus.
- Kiosk-gebruiksstatistieken/analytics (hoe vaak wordt de kiosk gebruikt, welk
  onderdeel het populairst is, ...) — mogelijk nuttige latere uitbreiding, niet
  gevraagd voor v1.
- Centraal beheer van meerdere kiosk-toestellen (de vlag is per browser/
  toestel, geen server-side aan/uit-registratie) — relevant zodra er meerdere
  fysieke kiosks zouden komen, nu niet.
- Nieuwe audio/geluidsfeedback op kiosk-niveau (bv. een chime bij reset) — het
  bestaande spel-geluid volstaat (zie §10).
- Automatische geldigheidsperiode (start-/einddatum) voor kiosk-mededelingen —
  v1 is uitsluitend handmatig aan/uit (expliciete keuze, zie beslissingen
  hierboven).
- Rijke opmaak of afbeeldingen in mededelingen — enkel platte tekst.
- Vertaling (nl/fr) van individuele mededelingen, of handmatig herordenen van
  de banner-volgorde — v1 toont in aanmaakvolgorde (nieuwste eerst).

## 13. Aanvaarde risico's

1. **Onvermelde URL als enige bescherming**: `/kiosk` wordt nergens gelinkt,
   maar is technisch bereikbaar voor eender wie de URL raadt/typt. In de
   praktijk laadt enkel de Raspberry Pi deze URL automatisch (§4); een gewone
   bezoeker zou hem toevallig moeten raden. Gevolg van dat randgeval zou zijn
   dat die persoon op zijn eigen toestel per ongeluk kiosk-modus activeert
   (idle-timeout + zwevende knop verschijnen dan ook bij hem). Impact laag:
   geen a-priori destructieve actie, en `il_kiosk_mode` uitzetten kost twee
   klikken (§6.5) — geen wachtwoord-lek of data-risico.
2. **`localStorage` kan gewist worden** (bv. browserdata wissen, private
   modus): kiosk-modus zou dan ongewild uitstaan tot personeel `/kiosk` opnieuw
   bezoekt. Geaccepteerd voor v1 — geen server-side registratie van welke
   toestellen kiosk-modus horen te hebben.
3. **Idle-reset raakt geen wijzigingen die al naar de server geschreven zijn**
   (bv. een voltooide check-out): dat is ook net de bedoeling — enkel
   *niet-opgeslagen* voortgang (een halfweg ingevulde wizardstap, een
   ingelogde sessie) gaat verloren bij reset, niet reeds bevestigde acties.
4. **Publieke leestoegang tot mededelingen** (`GET /api/kiosk/messages`, zie
   §11): eender wie kan technisch de actieve kiosk-mededelingen uitlezen via de
   API, ook buiten de kiosk zelf. Aanvaard, want de inhoud is sowieso bedoeld
   om publiek zichtbaar te zijn op een scherm — geen nieuw gevoelig-data-risico
   t.o.v. bv. `GET /news`.

## 14. Rollout-suggestie

1. Backend: `db.kiosk_messages` + datamodel (§7) + `backend/routes/kiosk.py`
   (§8), gemount in `server.py`.
2. Frontend admin: `AdminKiosk.jsx`-tabblad + koppeling in `AdminPanel.jsx`
   (aanmaken/bewerken/aan-uit/verwijderen van mededelingen) — apart en eerst
   testbaar, los van de rest van de kiosk-flow.
3. Frontend kiosk-kern: `KioskContext` (vlag-state + idle-timer +
   reset-routine) bouwen en handmatig testen (activatie, 280s-warning,
   300s-reset, activiteit-reset).
4. `Kiosk.jsx`-startmenu + route in `App.js`, incl. de vier tegels en de
   `KioskMessageBanner` (haalt `/kiosk/messages` op, poll elke 60s).
5. `KioskReturnButton` + `KioskIdleOverlay`, globaal gemount.
6. Uitschakel-actie (§6.5) op het startmenu.
7. i18n-strings toevoegen (nl + fr).
8. Handmatige test op een echt toestel met toetsenbord/muis/scherm/speakers in
   het magazijn vóór volledige uitrol: activeren, alle vier de paden
   doorlopen, een mededeling aanmaken/(de)activeren vanuit het admin-paneel en
   zien verschijnen/verdwijnen op de kiosk, idle-reset laten aflopen,
   kiosk-modus weer uitschakelen.

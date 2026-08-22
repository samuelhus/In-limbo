# In Limbo

**In Limbo** is een Brussels platform dat organisaties met overtollig materiaal ("aanbieders") in contact brengt met
organisaties of individuen die daar net iets aan hebben ("aanvragers") — zodat bruikbaar materiaal een nieuwe
bestemming krijgt in plaats van bij het afval te belanden.

- **Backend:** FastAPI + MongoDB (`backend/`)
- **Frontend:** React (Create React App via craco) (`frontend/`)
- **Talen:** Nederlands (primair) en Frans, via i18next

Voor een technische, op de codebase gerichte gids (architectuur, bestanden, conventies) zie
[`CLAUDE.md`](./CLAUDE.md). Dit document geeft het brede overzicht: wat het platform doet, voor wie, en welke
functionaliteiten er allemaal in zitten.

---

## Wie gebruikt het platform

- **Aanbieders** — leden van een organisatie die materiaal aanbieden dat ze zelf niet meer nodig hebben.
- **Aanvragers** — organisaties of individuen die op een aanbieding reageren om het materiaal te krijgen.
- **Donateurs** — particulieren of bedrijven zonder organisatie-account, die materiaal weggeven (via een aanbieding,
  of — enkel bedrijven — door het zelf naar het magazijn te brengen).
- **Admins** — beheren validatie, gebruikers, organisaties, content en de fysieke opvolging in het magazijn.

Een gebruikersaccount hoort bij een organisatie en doorloopt een validatiestatus (`pending` → `validated`/
`rejected`) vooraleer het platform volledig te kunnen gebruiken; donateurs slaan die wachtrij over.

---

## Functionaliteiten

### Aanbod & vraag (de kern)
- **Aanbiedingen** ("listings") plaatsen, bewerken en verwijderen: titel, beschrijving, materiaal, gewicht, foto's,
  technische fiches, eenmalig of terugkerend beschikbaar, deadline.
- **Aanvragen** ("applications") indienen op een aanbieding; de aanbieder kiest uiteindelijk 1 aanvrager (met
  eventueel een afwijkende toegekende hoeveelheid).
- **Zoekertjes** ("search requests"): een organisatie kan ook vragen naar iets dat nog niet als aanbieding bestaat.
- Overzichtspagina's "Mijn aanbiedingen", "Mijn aanvragen" en "Mijn zoekertjes" per gebruiker.
- Publieke catalogus met filters, en een publieke organisatiepagina per organisatie.
- Automatische archivering van verlopen aanbiedingen en heractivering/deactivering van inactieve organisaties
  (achtergrondtaken).

### Registratie & accounts
- Meerstaps-registratie voor een **nieuwe** organisatie, of om aan te sluiten bij een **bestaande, al gevalideerde**
  organisatie.
- Aparte registratieflow voor **donateurs** (particulier of bedrijf).
- Login, wachtwoord vergeten/resetten, e-mailvoorkeuren per gebruiker.
- GDPR-conforme accountverwijdering: persoonsgegevens worden geanonimiseerd, maar het account blijft bestaan zodat
  historische aanbiedingen/aanvragen/gesprekken geldig blijven.

### Communicatie
- **Berichten**: zodra een aanbieder een aanvrager selecteert, ontstaat een 1-op-1 gesprek — met bijlagen
  (foto's/bestanden, met een cumulatieve limiet), blokkeren, verbergen/verwijderen, een "afgehandeld"-markering,
  een ongelezen-badge op de Berichten-tab, en een e-maildigest voor wie een tijdje niet gekeken heeft. Zie
  `prd/PRD_direct_messaging.md` voor de volledige specificatie.
- **Notificaties**: in-app meldingen over eigen acties op het platform (bv. geselecteerd als aanvrager).
- **Meldingen**: een apart, admin-gericht concept voor gebeurtenissen die de aandacht van het beheerteam vragen
  (bv. een verdachte aanbieding, een vervallen aanbieding zonder herbestemming) — vandaag deels aanwezig via
  ntfy-pushmeldingen naar admins, met een volwaardige Meldingen-pagina in het admin-panel als geplande uitbreiding
  (zie `prd/PRD_meldingen_admin.md`).

Notificaties, Meldingen en Berichten zijn bewust 3 losse systemen — zie de toelichting in `CLAUDE.md`.

### Fysieke opvolging & impact
- **Checkin**: admins registreren materiaal dat rechtstreeks het magazijn binnenkomt.
- **Checkout**: het publieke proces waarmee een organisatie materiaal uit het magazijn ophaalt.
- **Impact-berekening**: hoeveel CO₂ er bespaard is door hergebruik, per materiaalcategorie, met een publieke
  verantwoordingspagina (`/impact-methodologie`) die exact de rekenmethode uitlegt.
- **Jaarverslag** voor donateurs (wat ze doorheen het jaar hebben weggegeven).
- Statistieken en transactieoverzichten in het admin-panel.

### Content
- **Nieuws** en **Inspiratie**-artikels (twee categorieën van hetzelfde onderliggende contentmodel), met tags voor
  inspiratieposts.
- Open Graph-previews (nette linkkaartjes bij het delen op WhatsApp/Facebook/LinkedIn/X) voor aanbiedingen en
  content-pagina's.
- Statische pagina's: Over ons, Partners, Contact, Voorwaarden, Privacy.

### "Schat of Schroot?" / "Trash ou Trésor?" — los mini-spel
Een Tinder-achtig swipe-spel (`/spel`) om aanbiedingen die nog geen bestemming vonden een tweede kans te geven:
- Volledig **losstaand account-systeem** (enkel username + e-mail, geen wachtwoord) — geen koppeling met het
  hoofdplatform-account.
- Swipe naar rechts (of gebruik de knoppen/pijltjestoetsen) bij inspiratie, naar links om te verwerpen.
- Bij inspiratie: 2 korte vragen beantwoorden ("Wie kan dit gebruiken?" / "Waarvoor?"); niet de eerste evaluator?
  Dan kies je de beste van de bestaande antwoorden.
- Punten en een scorebord (maandelijks + aller tijden).
- Eigen admin-uitbreiding: spelersbeheer (GDPR-verwijdering), aanbiedingen in/uit de spelpool halen, alle
  evaluaties per aanbieding bekijken/verwijderen, top-evaluaties modereren.

Zie `prd/PRD_Schat_of_Schroot.md` en `prd/TECHDESIGN_Schat_of_Schroot.md` voor de volledige specificatie.

### Admin-panel
Eén centraal paneel (`/admin`) met tabbladen voor: validatiewachtrij (gebruikers/organisaties goed-/afkeuren),
gebruikersbeheer, organisatiebeheer, nieuwsbeheer, zoekertjesbeheer, spelbeheer (zie hierboven), statistieken,
transacties, meldingen en gearchiveerde aanbiedingen — plus een apart overzicht van donateur-aanbiedingen.

### Internationalisatie
De volledige site is beschikbaar in het Nederlands (de leidende taal) en het Frans, met een taalwissel in de UI.
Nieuwe teksten moeten in beide talen aangevuld worden.

---

## Technische stack

**Backend** (`backend/`)
- FastAPI + MongoDB (via Motor/PyMongo)
- JWT-authenticatie in een httponly cookie
- APScheduler voor achtergrondtaken (archivering, herinneringen, e-maildigest)
- Cloudinary (media), Resend (e-mail), ntfy (adminpush), Sentry (foutmonitoring) — elk optioneel, de app degradeert
  netjes als de bijhorende env-variabele ontbreekt
- slowapi voor rate limiting op gevoelige routes

**Frontend** (`frontend/`)
- React 19, gebootstrapt met Create React App via **craco** (niet de kale `react-scripts`-config)
- React Router, Tailwind CSS, shadcn/ui-componenten (Radix-gebaseerd), Framer Motion (spel-animaties)
- i18next voor NL/FR
- Axios voor API-communicatie

---

## Aan de slag

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```
Vereist een `.env` in `backend/` met minstens `MONGO_URL`, `DB_NAME`, `JWT_SECRET`. Overige sleutels (Cloudinary,
Resend, MailerLite, ntfy, Sentry, `GAME_JWT_SECRET`) zijn optioneel — zonder die env-variabelen blijft de
betrokken functionaliteit gewoon werken of valt ze netjes terug, zonder de rest van de app te breken.

### Frontend
```bash
cd frontend
yarn install
yarn start
```
Vereist een `.env` in `frontend/` met `REACT_APP_BACKEND_URL` (bv. `http://localhost:8001`) zodat de frontend de
backend kan bereiken.

### Tests
```bash
cd backend
pytest
```
De backend-tests zijn integratietests: ze verwachten een **draaiende** backend + MongoDB, en loggen in als
geseede testaccounts (zie `backend/seed.py`) — geen gemockte auth.

---

## Meer lezen

- [`CLAUDE.md`](./CLAUDE.md) — architectuurgids per bestand/module, conventies, en het onderscheid tussen
  Notificaties/Meldingen/Berichten.
- [`prd/PRD_direct_messaging.md`](./prd/PRD_direct_messaging.md) — volledige spec van het berichtensysteem.
- [`prd/PRD_meldingen_admin.md`](./prd/PRD_meldingen_admin.md) — voorstel voor de admin-Meldingenpagina.
- [`prd/PRD_Schat_of_Schroot.md`](./prd/PRD_Schat_of_Schroot.md) en
  [`prd/TECHDESIGN_Schat_of_Schroot.md`](./prd/TECHDESIGN_Schat_of_Schroot.md) — spec van "Schat of Schroot?".

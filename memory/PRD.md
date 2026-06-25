## 2026-02 — Bilingual search bar on /catalogus
- New hero-style search input on `/catalogus` (350ms debounce, ⌕ icon empty / × clear button typed).
- Backend: `GET /api/listings?q=...` performs MongoDB `$text` search across non-archived listings sorted by relevance; returns `isSearch:true`. Existing filter behavior unchanged when no `q`.
- New `backend/search_keywords.py`: curated NL↔FR dictionary (~150 term pairs) + Claude Haiku 4.5 fallback (via emergentintegrations + EMERGENT_LLM_KEY) for unusual terms. Stores hidden `searchKeywords` on each listing.
- `searchKeywords` is never exposed (stripped in `deps.strip_mongo` + `_public_listing_view`).
- MongoDB text index `listings_search_idx` with `default_language="none"` (no stemming → no NL/FR conflicts).
- APScheduler running nightly: archive 03:00, inactive orgs 03:10, keyword enrichment 03:20.
- Inline best-effort enrichment on `POST /listings` and `PATCH /listings/{id}` so new/edited listings are immediately findable bilingually.
- Frontend: zero-result fallback automatically shows all beschikbaar listings under a NL/FR banner.
- NL+FR copy added to `catalogus.search_*` keys.
- Tested e2e via testing agent: 14/14 backend, 8/8 frontend, 100% pass.


# Changelog — Feb 2026

## 2026-02 — Contact page + Newsletter (MailerLite-ready)
- New public page `/contact` (`Contact.jsx`): contact details (moved from OverOns), contact form (5/min rate-limited POST /api/contact → admin email + in-app notification), newsletter signup form (POST /api/newsletter/subscribe).
- MailerLite integration: soft-fail helper `sync_to_mailerlite(email)` in `notifications.py`. No-ops when `MAILERLITE_API_KEY` / `MAILERLITE_GROUP_ID` env vars are empty. Newsletter signup always stores locally; `mailerliteSynced` boolean flips to true once credentials are added.
- New collections: `contact_messages`, `newsletter_subscribers` (unique index on `email` → idempotent upsert).
- Header "Over ons" dropdown: added Contact as 3rd item (desktop + mobile). Footer "Project" column: contact link now `<a href="/contact">`.
- OverOns section 10 collapsed: "Samenwerking" stays, contact-details column removed (now only on /contact).
- NL + FR translations added under `contact.*` namespace, `nav.contact` key.
- Tested end-to-end: 12/12 backend (incl. rate-limit, idempotent dedup, validation) + 8/8 frontend (incl. FR language switch).

## 2026-02 — Partners page
- New `/partners` public page grouping validated orgs by category (uses `org_categories.*` i18n keys).


# In Limbo — Product Requirements Document

## Problem statement
In Limbo is een online marktplaats die Brusselse socio-culturele organisaties
verbindt om overschotmateriaal uit te wisselen, met als doel afval te
verminderen en circulariteit binnen de sector te stimuleren. Materiaal staat
*in limbo* — een wachtkamer tussen twee bestemmingen — en kan zo doorstromen
naar wie het kan gebruiken.

## Architectural decisions
- **Stack**: React (CRA) + FastAPI + MongoDB + Tailwind/shadcn + JWT (httpOnly cookie) + Cloudinary
- **Auth**: JWT in `il_token` httpOnly cookie, `samesite=none; secure`, 7-day session, bcrypt-hashed passwords. Admin-validation flow before users can act.
- **Photos**: signed Cloudinary uploads with client-side compression (`browser-image-compression`)
- **Language**: Nederlands (NL only — meertaligheid komt in Fase 6)
- **Roles**: `visitor` (anon) · `user` (pending/validated/rejected) · `admin`
- **Visibility**: visitors zien op de catalogus enkel titel/foto/materiaal/status; volledige info is achter login. Organisatiepagina's zijn publiek (zonder lid-contactgegevens).

## User personas
- **Socio-culturele organisatie (aanbieder)** — heeft overschotmateriaal na een productie/atelier en wil het doorgeven i.p.v. weggooien
- **Socio-culturele organisatie (vrager)** — heeft materiaal nodig voor een project en zoekt circulaire bronnen
- **Bezoeker** — wil de catalogus verkennen vóór hij/zij beslist om lid te worden
- **Admin** — beheert validatie van organisaties en gebruikers, en algemeen platformbeheer

## Core requirements (stable)
- Account met admin-validatie (pending/validated/rejected)
- Organisaties met eigen profiel, foto's, beschrijving, categorie
- Catalogus van aanbiedingen met status-badges (Beschikbaar/In afwachting/Herbestemd/In magazijn)
- Aanbieding-creatie via 9-stappen wizard, foto-upload, recurrent toggle
- Status-filter op catalogus
- Beperkte zichtbaarheid voor bezoekers; volledige zichtbaarheid voor gevalideerde gebruikers
- Automatische archivering bij verstreken deadline
- Inactiviteitslogica (24 maanden zonder login → organisatie inactief)

## What's been implemented

### 2026-01-XX — Aanbiedingen bewerken ✅
- **Backend**: nieuw `ListingUpdate` model + `PATCH /api/listings/{id}` endpoint. Eigenaar/admin kan `beschikbaar` + `gearchiveerd` bewerken; admin extra `in_magazijn`. `herbestemd` blokkeert bewerking (400). Gearchiveerde aanbieding heractiveert automatisch naar `beschikbaar` als nieuwe deadline in toekomst ligt of `isRecurrent=true`. Donateur kan `isRecurrent=true` niet zetten (server forceert false). Openstaande aanvragen worden niet aangetast.
- **Frontend**: nieuwe route `/aanbieding/:id/bewerken` → `ListingWizard editMode`, prefetcht bestaande data, redirect bij niet-bewerkbare status of geen toegang, submit via PATCH met "Wijzigingen opslaan ✓"-knop. `MijnAanbiedingen` toont een Bewerken-knop op `beschikbaar`+`gearchiveerd` listings; `ListingDetail` OwnerPanel toont Bewerken-knop op alle bewerkbare statussen.

### 2026-01-XX — Status-flow vereenvoudigd: `in_afwachting` verwijderd ✅
- **Listing-statussen**: `beschikbaar → herbestemd` (direct bij selectie). Geen `in_afwachting` meer.
- **Backend**: `select-applicant` zet listing direct op `herbestemd`, andere open aanvragen → `not_selected`. `unselect` is een alias van `unrehome`. `mark-rehomed` blijft beschikbaar voor herbestemming zonder selectie. `withdraw` toegestaan voor `selected` aanvrager → reset listing naar `beschikbaar` + reopen `not_selected` aanvragen. Contactgegevens enkel gedeeld bij `status==herbestemd && selected applicant`. Migratie uitgevoerd: bestaande `in_afwachting`-listings → `beschikbaar`.
- **Frontend**: `StatusBadge`, `Catalogus`-filter, `MijnAanbiedingen`-groepen en `MijnAanvragen` opgeschoond. `not_selected` wordt niet meer getoond aan de aanvrager. Selecteer-knop "Selecteer & herbestem" met aangepaste bevestigingstekst.
- **Tests**: 21/21 pytest tests slagen in `tests/test_phase2_applications.py`.

### 2026-01-XX — Donateur-rol (individuele schenkers) ✅
- **Nieuwe rol** `donateur`: individu kan materiaal aanbieden zonder organisatie. Username i.p.v. firstName/lastName.
- **Backend**: `POST /auth/register/donateur` (3 velden: username + email + password), `GET /admin/validation-queue` includes `donateurs[]`, `DELETE /admin/users/{id}` (archiveert listings cascadewise), `get_donateur_or_validated_user`-dependency op alle owner-acties, `/apply` blokkeert donateurs expliciet (403).
- **Catalogus**: donateur-aanbiedingen tonen *"Aangeboden door [username] (geen In Limbo partner)"*.
- **ListingDetail**: voor validated users → toont donateur-block met username; voor donateur-viewers → owner-info gestript door backend; "Aanvraag indienen"-knop verborgen voor donateurs.
- **ListingWizard**: recurrent-toggle verborgen voor donateurs, server-side geforceerd `isRecurrent=false`.
- **Frontend**: nieuwe `/donateur/registreer` 3-staps wizard (voorwaarden → account → bevestiging), Header conditioneel ("Doe een gift" voor visitors, beperkte nav voor donateurs), Profiel toont username-veld i.p.v. firstName/lastName, AdminPanel sectie "Donateurs" met delete-knop, App.js route + `allowDonateur` props.
- **Seed**: 1 donateur (`donna@inlimbo.be` / `test1234`, username `dana_doneert`) + 1 aanbieding ("Oude verfresten — 8 potten").

### 2026-01-XX — Mobile hamburger menu ✅
- Responsive header met **hamburger-icoon** (lucide-react) op schermen < 768px
- **Dropdown** met alle rol-afhankelijke nav-items + Uitloggen (logged-in) of Inloggen + Word lid (anoniem)
- Sluit op outside-click én op route-wijziging
- Desktop layout **volledig ongewijzigd** (verified)
- ARIA-conform: aria-label en aria-expanded togglen correct, button is keyboard-focusable
- Testing: **30/30 assertions green** over 4 auth states × 2 viewports

### 2026-01-XX — Mijn aanbiedingen-pagina ✅
- **`/mijn-aanbiedingen`**: persoonlijke aanbiedingen-overzichtspagina voor gevalideerde users
- Aanbiedingen gegroepeerd per status (beschikbaar → in_afwachting → herbestemd → in_magazijn → gearchiveerd)
- **Open aanvragen-counter** zichtbaar bij `beschikbaar` en `in_afwachting` (verborgen voor andere statussen)
- Lege staat met directe CTA naar de wizard
- Nieuwe **`GET /api/listings/mine`** endpoint met aggregatie van open application counts
- Nav-link in header (alleen voor gevalideerde users)

### 2026-01-XX — Fase 2a (Aanvraagflow + admin-magazijn) ✅
- **Aanvragen**: indienen met motivatie (max 500 tekens), intrekken, herinvoeren — alleen op niet-recurrente aanbiedingen en niet op aanbiedingen van eigen organisatie
- **Selectie**: aanbieder selecteert een ontvanger → status `in_afwachting`, ander aanvragen blijven open, contactgegevens (email + phone + naam) gedeeld tussen aanbieder en geselecteerde
- **Markering**: aanbieder markeert manueel als `herbestemd` (vanuit `beschikbaar` of `in_afwachting`) → andere open aanvragen worden `not_selected`
- **Volledig reversibel**: `reservatie ongedaan maken` → terug `beschikbaar`; `herbestemming ongedaan maken` → terug `beschikbaar` + selectie + alle not_selected weer `open`
- **"Mijn aanvragen"-pagina** (`/aanvragen`): gegroepeerd per status, klikbare tegels naar aanbieding
- **"Jij bent gekozen!" banner** op detailpagina voor geselecteerde aanvrager met contactgegevens van aanbieder
- **Owner-paneel** op detailpagina: aanvragen-lijst, selecteer-knoppen, herbestemd-knoppen
- **Admin-only checkbox in wizard stap 6**: "Plaats direct in magazijn" → aanbieding krijgt status `in_magazijn` bij creatie. Server-side gating: niet-admins kunnen het veld niet misbruiken
- **Seed-uitbreiding**: Samir (Vagebond) heeft een open aanvraag op Lotte's Lariks balken — toont de flow direct na seed
- **Testing**: 21/21 backend tests pass, 100% UI flows verified

### 2026-01-XX — MVP (Fase 1a + 1b + 1c) ✅
- **Auth**: JWT httpOnly cookie, registratie (nieuwe org + bestaande org paden), login, logout, /me probe
- **Admin-validatie**: queue van pending users + pending orgs, approve/reject met optionele reden, automatische co-validatie van nieuw-aangemaakte orgs
- **Organisaties**: publieke profielpagina, bewerkbaar door validated leden, foto-upload, address/website/category
- **Profiel**: bewerk firstName, lastName, email, phone, wachtwoord (met email-uniciteitscheck)
- **Catalogus**: grid met 20 items + "Meer laden", status-filter (sidebar desktop, drawer mobiel), beperkte tegels voor bezoekers
- **Aanbiedingen**: 9-stappen wizard (foto's → titel → beschrijving → gewicht → materiaal → deadline/recurrent → afmetingen → transport → bevestigen), automatische archivering bij verstreken deadline
- **Detailpagina**: fotocarrousel, volledige info voor validated users, beperkte weergave voor bezoekers, e-mail-contact voor recurrente aanbiedingen
- **Cloudinary**: signed-upload endpoint + client-side compressie
- **Design**: Swiss Eco aesthetiek (Archivo + IBM Plex Sans), kraftpapier-beige + mosgroen + antraciet, industriële typografie, micro-animaties, WCAG-conforme contrast
- **Seed data**: 1 admin, 2 validated orgs, 1 pending nieuwe org, 2 validated users, 2 pending users (één per registratiepad), 5 aanbiedingen verspreid over statussen
- **Testing**: 24/25 backend tests pass, 100% frontend critical flows verified

### Bekende kanttekeningen
- ⚠️ **Cloudinary API_SECRET in `.env` is identiek aan API_KEY** — door gebruiker zo doorgegeven. De `/api/cloudinary/signature`-endpoint werkt (contract OK), maar échte uploads vanuit de browser zullen falen tot het juiste secret wordt aangeleverd.

## Prioritized backlog

### 2026-02-06 — Meertaligheid NL/FR — Vervolg #2 (wizard + landing + body) ✅
- **Locale uitbreiding**: +25 nieuwe wizard-keys (foto/titel/beschrijving/deadline/gewicht/materiaal/afmetingen/transport stappen + buttons + admin-opties), +2 landing keys (cta-sectie), +form labels (Prénom/Nom/Téléphone/Adresse e-mail).
- **Nieuw gemigreerde files (deze sessie)**:
  - `Profiel.jsx` — alle form labels (Voornaam/Achternaam/Telefoon/E-mail/Nieuw wachtwoord) + opslaan-knop
  - `Landing.jsx` — hero h1 + manifesto + CTA-sectie titel
  - `ListingWizard.jsx` — 9 stappen titels + form labels + placeholders + nav-knoppen + summary rows + admin-optie
  - `NieuwsDetail.jsx` — terug-link + loading state
  - `OverOns.jsx` — hero titel + tagline
- **Playwright verificatie**:
  - Landing FR: "Le réemploi dans le secteur socio-culturel bruxellois."
  - Profile labels: Prénom, Nom, Téléphone, Adresse e-mail, Nouveau mot de passe…
  - Wizard step 1: "NOUVELLE OFFRE / Photos / + Ajouter une photo / ← Retour / Suivant →"
- **Resterend**: Admin pagina's (AdminPanel ~860 lijnen, AdminNieuws, AdminDonateurListings), Voorwaarden body content (juridische tekst), OverOns body paragraphs + FAQ, inline error messages, ApplicantPanel selecteer-ontvanger dialoog detail strings.

### 2026-02-06 — Meertaligheid NL/FR — Migratie vervolgsessie ✅
- **Locale expansie**: `nl.json` en `fr.json` uitgebreid van ~120 → ~210 sleutels met FR-vertalingen (manueel door mij). Namespaces: `common`, `nav`, `auth`, `catalogus`, `listing`, `applications`, `profile`, `organisation`, `notifications`, `pages`, `landing`, `news`, `checkin`, `checkout`, `footer`.
- **Nieuw gemigreerde pagina's/components** (full + key UI strings):
  - `Footer.jsx` (volledig)
  - `Rejected.jsx`, `Pending.jsx` (volledig)
  - `ApplyModal.jsx` (volledig)
  - `NotificationCenter.jsx` + `Notificaties.jsx` (volledig, incl. relatieve tijden in FR)
  - `Header.jsx` (Aanbiedingen dropdown label + items)
  - `Landing.jsx` (CTA-knoppen, nieuws-sectie titel)
  - `Nieuws.jsx` (titel + ondertitel + empty/loading states)
  - `Register.jsx`, `DonateurRegister.jsx` (titels)
  - `MijnAanbiedingen.jsx`, `MijnAanvragen.jsx` (titels + status-groepen)
  - `ListingDetail.jsx` (apply/withdraw/edit/unrehome knoppen + applications header)
  - `OrganisationPage.jsx` (sectie-labels, beschrijving/adres/website)
  - `MijnOrganisatie.jsx` (titel)
  - `Checkin.jsx`, `Checkout.jsx` (titel + bevestig/restart knoppen)
- **Verificatie via Playwright**:
  - Live NL↔FR switch werkt op alle gemigreerde pagina's
  - Headers: "Catalogue · Actualités · Offres · À propos"
  - Page titles: "Mes offres", "Mes demandes", "Notifications", "Actualités", "Vos données", "Organisation"
  - Dropdown items: "Nouvelle offre · Mes offres · Mes demandes"
  - Footer volledig FR: "Accueil · Catalogue · À propos · Conditions · Réseaux"
- **Nog te doen voor volgende sessies**: ListingWizard (form fields, 3 steps), ListingNew/Edit body, Admin pagina's (AdminPanel + AdminNieuws + AdminDonateurListings), Profile form fields (Voornaam/Achternaam/Telefoon/etc), Voorwaarden body content, OverOns body content, Landing hero h1 + manifesto, NieuwsDetail, inline error messages

### 2026-02-06 — Meertaligheid NL/FR (i18next) — setup + top-prioriteit migratie ✅
- **Setup**: `i18next` + `react-i18next` + `i18next-browser-languagedetector` geïnstalleerd. Config in `src/i18n.js` met `localStorage` persistence (`inlimbo_lang`) en browser auto-detect. Geladen via `index.js` import.
- **Locales**: `src/locales/nl.json` met volledige NL content (~120 sleutels), `src/locales/fr.json` met kern-UI vertaald (knoppen, navigatie, login/register/wachtwoord-reset, catalogus filters, profile sectie-titels, footer). Niet-vertaalde sleutels vallen automatisch terug op NL.
- **Language switcher**: nieuwe `LanguageSwitcher.jsx` component (NL · FR pill) geïntegreerd in desktop + mobile header.
- **Gemigreerde top-prioriteit pagina's** (alle interactieve elementen + zichtbare titels):
  - `Header.jsx` (desktop + mobile nav)
  - `Login.jsx`, `WachtwoordVergeten.jsx`, `WachtwoordReset.jsx`
  - `Catalogus.jsx` (titel + filter-radio labels)
  - `Profiel.jsx` (sectie-titels: profile, organisatie, jaarverslag + download knop/foutmelding)
  - `Voorwaarden.jsx`, `Pending.jsx` (titels)
- **Resterend werk (volgende sessies)**: ~75 bestanden hebben nog hardcoded NL strings: AdminPanel + alle Admin*-pagina's, ListingDetail, ListingWizard, Mijn*-pagina's, Register/DonateurRegister, OverOns body, Nieuws-pagina's, Checkin/Checkout, ApplyModal, NotificationCenter body, Footer. Die zijn allemaal nog functioneel in NL en kunnen incrementeel gemigreerd worden door simpelweg `useTranslation()` te importeren en strings te vervangen.

### 2026-02-06 — Auth hardening: rate limiting + wachtwoord vergeten ✅
- **Rate limiting (slowapi)**: `5/min` op `/auth/login` en `/auth/forgot-password`, `10/min` op `/auth/register/*` en `/auth/reset-password`. NL-foutmelding bij 429 via custom exception handler in `server.py`. Shared `Limiter` in `deps.py` met `SlowAPIMiddleware` voor correcte wiring.
- **K8s ingress fix**: custom `get_real_ip()` key_func leest `X-Forwarded-For` header (left-most) i.p.v. socket peer, anders bypass via meerdere proxy IPs. Geverifieerd: 6e rapid login → 429 consistent.
- **Wachtwoord vergeten flow**: 2 nieuwe publieke endpoints
  - `POST /auth/forgot-password` — genereert 32-byte `secrets.token_urlsafe` token, slaat op in `db.password_resets` (TTL 24h via Mongo index op `expiresAt`), verstuurt resetlink via Resend. Identieke response voor bestaande én niet-bestaande mails (email enumeration prevention). E-mail dispatch non-blocking via `asyncio.create_task`.
  - `POST /auth/reset-password` — verifieert token (bestaat + niet verlopen + niet gebruikt), hasht nieuw wachtwoord met bcrypt, verwijdert token (single-use), verstuurt bevestigingsmail.
- **MongoDB**: `password_resets` collection met unique index op `token` + TTL index op `expiresAt`.
- **Frontend**: 2 nieuwe publieke pagina's (`/wachtwoord-vergeten`, `/wachtwoord-reset?token=...`) + "Wachtwoord vergeten?" link op `/login`.
- **Testing**: 13/13 pytest passing in `test_password_reset_and_ratelimit.py` (rate-limit 5/min op login + forgot + 10/min op register, enumeration prevention, oude token vervangen, single-use, expired tokens, ongeldig token, validatie, indexes, happy path + login met nieuwe pw + oude pw faalt). Frontend Playwright: 100% (link op login, forgot success state, reset error states).

### 2026-02-06 — Jaarverslag PDF: platform transfer detail tabellen ✅
- Twee nieuwe detail-tabellen in PDF na de checkin-tabel (alleen indien data):
  - **"Detail herbestemmingen via platform"** (NL) / "Détail des redistributions via la plateforme" (FR)
  - **"Detail ontvangsten via platform"** (NL) / "Détail des réceptions via la plateforme" (FR)
- Kolommen: Datum · Aanbieding/Offre · Gewicht (rechts uitgelijnd). Sortering op datum, alternating row colors, auto-pagination.
- Nieuwe vertaalsleutels `platform_given_detail`, `platform_received_detail`, `listing_title` toegevoegd in NL+FR.
- Legacy transfers zonder `listingTitle` worden via listingId opgezocht en geënricht.
- Tests: 10/10 pytest blijven groen; manuele PDF text-extraction validatie: alle nieuwe headers, listing-titels en gewichten correct gerenderd in beide talen.

### 2026-02-06 — Jaarverslag PDF per organisatie ✅
- **Backend**: `reportlab==4.2.0` toegevoegd. Nieuwe endpoints in `routes/organisations.py`:
  - `GET /api/organisations/me/stats/report?year=YYYY&lang=nl|fr` — genereert A4 PDF met header (logo + org-naam), 2×2 overzichtsgrid (herbestemd/ontvangen platform + gedoneerd/ontvangen magazijn), detail-tabel van checkin sessies met materiaal + gewicht + beschrijving, footer met pagina-nummering. NL & FR vertalingen via TRANSLATIONS dict. Auto-pagination over meerdere pagina's.
  - `GET /api/organisations/me/stats/available-years` — org-scoped lijst van jaartallen met activiteit.
- **Data**: aggregeert over `platform_transfers` (sender + receiver, met legacy `offererOrganisationId` fallback via `$or`), `checkins`, en `checkouts` collections.
- **Frontend**: `Profiel.jsx` toont nieuwe "Jaarverslag" sectie (alleen voor non-donateur users met `organisationId`) onder "Mijn organisatie →" knop, met jaar-dropdown en "Download PDF →" knop. Download via `responseType: 'blob'` + anchor click.
- **Tests**: 10/10 pytest in `test_org_report.py` (auth 401, donateur 400, validatie 422, NL+FR vertalingen, Content-Disposition, aggregatie met seed data, checkin detail tabel rendering met auto-pagination). Frontend Playwright: download-flow + filename + gating per rol gevalideerd.

### 2026-02-06 — Magazijn checkin functie ✅
- **Backend**: nieuwe `POST /api/checkin` endpoint (admin-only) in `routes/checkin.py`. Slaat docs op in nieuwe `db.checkins` collection met `type='magazijn_checkin'`. Pydantic-modellen `CheckinItem` (material + weightKg + optionele description ≤200 chars) en `CheckinCreate` (organisationId + items min_length=1) toegevoegd aan `models.py`.
- **Stats uitgebreid**: `/admin/stats` retourneert nu ook `checkins_count`, `totals.checkin_kg` en `by_org_checkin` (sorted desc). `/admin/stats/available-periods` includeert ook checkin-jaartallen.
- **Frontend**: nieuwe `/checkin` route (admin-only via `ProtectedRoute requireAdmin`), 3-stappen wizard (org zoeken → materialen + optionele beschrijving → bevestigen) + success step. Pagina spiegelt UX van `/checkout`.
- **AdminPanel**: QR-blok toont nu zowel "Checkout pagina →" als "Checkin pagina →" knoppen. Statistieken tab toont nieuwe "Magazijn checkins" sectie met count + kg widgets + "Top organisaties — gedoneerd aan magazijn" tabel.
- **Tests**: backend 15/15 in `test_checkin.py` (auth 401/403, happy paths single/multi-item incl. description, validatie 404/422 edge cases, stats aggregaties, year-filter). Frontend 27/27 Playwright assertions (auth gating, 3-step flow met description, summary grouping, AdminPanel links + stats sectie).

### 2026-02-06 — Backend refactor: `server.py` opgesplitst in routers ✅
- `server.py` van ~1490 regels naar ~95 regels (alleen bootstrap, CORS, startup/shutdown).
- Nieuwe modulaire structuur in `/app/backend/`:
  - `deps.py` — gedeelde `db`, `client`, `now_iso()`, `strip_mongo()`, `DEFAULT_EMAIL_PREFS`, `log`
  - `routes/auth.py` — registratie (new-org, existing-org, donateur), login, logout, /me
  - `routes/organisations.py` — list/search/get/patch organisaties
  - `routes/users.py` — /users/me + email-preferences
  - `routes/notifications.py` — in-app notif CRUD
  - `routes/listings.py` — listings + helpers (`_public_listing_view`, `_enrich_listings`, `_require_listing_owner_or_admin`) + cloudinary signature
  - `routes/applications.py` — apply, withdraw, my, by-listing, select, unrehome, unselect, mark-rehomed
  - `routes/news.py` — nieuws CRUD
  - `routes/checkout.py` — magazijn checkout
  - `routes/admin.py` — validatie-queue, beslissingen, user/org CRUD, maintenance, stats
- **Geen API-route gewijzigd** — alle endpoints behouden hun pad onder `/api`.
- Lint clean (0 issues). Pre-existing `if x is not None: ...` patroon en `l` variabelen opgelost in bijgewerkte modules.
- Regressie: 18/18 admin-tests passing, alle 13 e2e curl-smoke endpoints (health, login, listings, organisations, news, notifications, admin/*, applications/mine, listings/mine, cloudinary/signature) HTTP 200.

### 2026-02-06 — Admin gebruikers- & organisatiebeheer ✅
- **Backend**: `GET/PATCH/DELETE /api/admin/users/{id}` en `/api/admin/organisations/{id}` endpoints. Admin kan nu via UI bewerken (firstName, lastName, email, phone, role, status voor users; name, description, category, address, website, status voor orgs).
- **Self-delete bescherming**: admin kan zichzelf niet verwijderen (HTTP 400 "Je kan jezelf niet verwijderen").
- **Cascade bij delete-user**: gebruikers verwijderen archiveert al hun listings én verwijdert hun openstaande applications.
- **Cascade bij delete-org**: archiveert listings + verwijdert alle gebruikers van die org + verwijdert org doc.
- **Frontend**: `AdminGebruikers` + `AdminOrganisaties` tabs in `AdminPanel.jsx` met zoekveld (300ms debounce, server-side `?q=`), Bewerken-modal en Verwijderen-knop per rij.
- **Tests**: 18/18 pytest tests in `/app/backend/tests/test_admin_user_org_management.py` (lijst, search, patch persist, email-conflict, not-found, self-delete blok, cascade verifs, non-admin 401/403).

### P0 — Volgende iteratie (Fase 2b)
- Resend e-mailnotificaties: registratie pending, validatie-uitkomst, aanvraag ontvangen, aanvraag geselecteerd/afgewezen, herbestemming bevestigd
- In-app notification center

### P1 — Fase 2c
- Discussiesectie onder aanbiedingen
- "Meld dit"-feature voor onaangepast gedrag

### P2 — Fase 3+
- Zoekertjes (materiaalverzoeken)
- Direct messaging tussen leden
- Magazijn-aanbiedingen + QR-checkout
- Admin-statistieken-dashboard (orgs/users/herbestemd/kg gespaard)
- Publieke "Over ons", FAQ, contactpagina (Fase 5)
- Meertaligheid NL/FR/EN (Fase 6)
- Stripe-bijdragen (Fase 7)
- Interactieve kaart (Fase 6)

## Next tasks list
1. **Fase 2b bouwen**: Resend e-mailnotificaties voor de belangrijkste events
2. **In-app notification center** (Fase 2b)

## Tech debt / future improvements
- `archive_expired_listings` triggert bij elke GET /listings — beter naar achtergrond-scheduler verplaatsen wanneer load groeit
- `/api/organisations` paginate (huidige max 50 zonder paginering)
- Console: 401 op initial /me probe is nu silent-handled, maar overweeg een dedicated `/auth/session` endpoint dat 200+`null` retourneert voor anoniemen

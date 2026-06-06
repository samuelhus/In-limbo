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

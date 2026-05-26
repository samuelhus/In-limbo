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

### P0 — Volgende iteratie (Fase 2a)
- Aanvraagflow: gevalideerde gebruikers kunnen zich kandidaat stellen voor een aanbieding
- Aanbieder ziet kandidaten, kiest een ontvanger → contactgegevens worden gedeeld → status wordt "Herbestemd"
- Status-transitie naar "In afwachting van pickup" tijdens selectie

### P1 — Fase 2b + 2c
- Resend e-mailnotificaties (registratie pending, validatie, aanvraag ontvangen/geselecteerd, afgewezen, …)
- In-app notificatiecenter
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
1. **Cloudinary API_SECRET corrigeren** — vraag user de juiste waarde uit Cloudinary dashboard
2. **Fase 2a bouwen** (aanvraagflow + status-transitions)
3. **Resend integreren** voor de eerste set notificaties (validatie + aanvraag)
4. **Optional polish**: tooltip-uitleg bij wizard-stappen, betere lege-staat illustraties, browser-image-compression progress indicator

## Tech debt / future improvements
- `archive_expired_listings` triggert bij elke GET /listings — beter naar achtergrond-scheduler verplaatsen wanneer load groeit
- `/api/organisations` paginate (huidige max 50 zonder paginering)
- Console: 401 op initial /me probe is nu silent-handled, maar overweeg een dedicated `/auth/session` endpoint dat 200+`null` retourneert voor anoniemen

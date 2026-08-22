# PRD — Meldingen (admin-overzicht van platformgebeurtenissen)

**Status:** Concept — v1 scope
**Auteur:** Samuel (product) + Claude (co-auteur)
**Datum:** 2026-08-22
**Repo:** In-limbo

---

## 1. Probleemstelling

Admins hebben vandaag geen centraal overzicht van gebeurtenissen op het platform die hun aandacht vragen. Signalen zoals een verdachte aanbieding, een naderende deadline, een vervallen aanbieding zonder herbestemming, een nieuw zoekertje, een opvallend goede evaluatie in "Schat of Schroot?", of een geblokkeerd gesprek zijn nu ofwel onzichtbaar, ofwel verspreid (bv. losstaand in de database, of impliciet af te leiden uit statuswijzigingen die admins zelf actief zouden moeten opzoeken). Er is geen plek waar een admin in één oogopslag ziet: "dit vraagt vandaag mijn aandacht."

Dit voorstel introduceert het concept **Melding**: een record van een gebeurtenis op het platform, gericht aan de admin-groep als geheel, die samenkomt op één nieuwe **Meldingen-pagina** in het admin-panel.

## 2. Doel & succescriteria

1. **Overzicht behouden** — admins kunnen op één pagina zien welke gebeurtenissen aandacht vragen, zonder elke module (aanbiedingen, zoekertjes, gesprekken, spel) apart te moeten doorzoeken. Metric: alle 6 in scope genomen triggers (§5) verschijnen op de Meldingen-pagina binnen enkele minuten na de gebeurtenis.
2. **Bij oogopslag** — een open-aantal (badge) in de admin-navigatie maakt meteen zichtbaar of er onafgehandelde meldingen zijn, analoog aan de bestaande bell-badge voor gebruikers-notificaties.
3. **Geen ruis** — elke gebeurtenis genereert **precies één** Melding (geen duplicaten bij herhaalde triggers van dezelfde onderliggende gebeurtenis, zie per-trigger idempotentie in §6).

Niet-doel voor v1: automatische acties vanuit een Melding (bv. een aanbieding automatisch offline halen bij een melding) — een Melding is een signaal, geen moderatie-workflow-engine. De admin onderneemt actie via de bestaande beheerschermen (aanbieding, zoekertje, gebruiker, ...); de Melding linkt daar enkel naartoe.

## 3. Kernbeslissing: Melding ≠ Notificatie

Dit is de belangrijkste architecturale knoop in dit voorstel, en bewust apart gehouden van het bestaande `notifications`-systeem (`backend/notifications.py`, collectie `db.notifications`, bell-icoon `NotificationCenter.jsx`).

| | **Notificatie** (bestaand) | **Melding** (nieuw) |
|---|---|---|
| **Doelpubliek** | Eén specifieke gebruiker (`userId`) | De admin-groep als geheel — geen eigenaar |
| **Voorbeeld** | "Je aanvraag is geselecteerd", "Je aanbieding-deadline is verlopen" | "Aanbieding X is gemeld", "Zoekertje Y is nieuw binnengekomen" |
| **Leesstatus** | Per-gebruiker `read: true/false` (ieder z'n eigen kopie/status) | **Eén gedeelde status** (`open` / `afgehandeld`) — als admin A een Melding afhandelt, is ze voor alle admins afgehandeld. Geen aparte "gelezen"-status per admin: een team-inbox, geen persoonlijke mailbox. |
| **Plaats in UI** | Bell-icoon, overal in de app (ook voor gewone gebruikers) | Eigen pagina **"Meldingen"** in het admin-panel, enkel zichtbaar voor admins |
| **Bewaartermijn** | 30 dagen (`purge_old_notifications`) | Geen automatische verwijdering in v1 (zie §10) — een team wil een gebeurtenis kunnen navertellen, ook na 30 dagen |
| **Opslag** | `db.notifications` | Nieuwe collectie `db.reports` (zie §7) |

**Waarom niet hergebruiken van `db.notifications` met `userId` = elke admin?** Dat patroon bestaat vandaag al gedeeltelijk (`notify_admins_contact_message`, `notify_admins_new_registration` maken voor élke admin een aparte notificatie-kopie aan). Dat werkt voor lichte, informatieve gebeurtenissen, maar schaalt niet naar een écht team-overzicht: bij 3 admins zou elke gebeurtenis 3× moeten worden afgevinkt (elke admin z'n eigen "gelezen"-vlag), en er is geen gedeeld beeld van "is dit al opgevolgd door iemand van het team?". Vandaar een aparte collectie met **één gedeelde status per gebeurtenis**, in plaats van drie.

**Blijft ongewijzigd:** de bestaande admin-gerichte notificaties (`contact_message`, `new_registration`) blijven zoals ze zijn — dit voorstel breidt dat systeem niet uit en migreert het niet. Een toekomstige opruiming (die twee typen ook naar `db.reports` verhuizen) is expliciet **out of scope** voor v1 (zie §11), maar wordt aangeraden als vervolgstap zodra Meldingen bewezen heeft gewerkt.

## 4. Meldingen-pagina (admin)

- Nieuwe route/pagina, analoog aan de bestaande `AdminZoekertjes.jsx` / `AdminTransacties.jsx` qua patroon: `frontend/src/pages/admin/AdminMeldingen.jsx` op `/admin/meldingen`.
- Nieuwe link in de admin-navigatie **"Meldingen"**, met een badge met het aantal **open** meldingen (rode badge, zelfde stijl als de bestaande bell-badge) — gepolld op hetzelfde 60 sec-interval (`POLL_MS`) als `NotificationCenter.jsx`, voor consistentie.
- Lijst toont per Melding: type (met icoon/kleur per type), korte omschrijving, tijdstip, link naar het onderliggende object (aanbieding/zoekertje/gesprek/evaluatie), status (open/afgehandeld).
- Filters: op type (6 triggers, zie §5) en op status (open / afgehandeld / alle). Standaardweergave: enkel **open**, nieuwste eerst.
- Actie per Melding: **"Afhandelen"** (zet status op `afgehandeld`, registreert `handledByAdminId` + `handledAt`) en **"Heropenen"** (voor per ongeluk afgevinkte meldingen).
- Geen bulk-acties in v1 (zie §11).

## 5. Meldingstypes (triggers) — scope v1

Zes triggers, elk hieronder verder uitgewerkt in §6:

1. **Aanbieding gemeld** (`listing_reported`) — een ingelogde gebruiker meldt een aanbieding via een nieuwe "Meld"-knop, omdat ze niet aan de gebruiksvoorwaarden voldoet.
2. **Deadline nadert** (`deadline_approaching`) — een aanbieding komt binnen 7 dagen aan haar deadline.
3. **Vervallen zonder herbestemming** (`listing_expired_unrehomed`) — een aanbieding verloopt (wordt gearchiveerd) zonder ooit `herbestemd` te zijn geweest.
4. **Nieuw zoekertje** (`new_search_request`) — een gebruiker plaatst een nieuw zoekertje.
5. **Evaluatie met hoge score** (`evaluation_high_score`) — een evaluatie in "Schat of Schroot?" (`game_evaluations`) haalt meer dan 10 punten.
6. **Gesprek geblokkeerd** (`conversation_blocked`) — een gebruiker blokkeert de tegenpartij in een gesprek.

## 6. Per trigger: functionele requirements & implementatie

### 6.1 Aanbieding gemeld (`listing_reported`)

- **Meld-knop** op de aanbiedingdetailpagina (`Aanbieding.jsx` of gelijkaardig), zichtbaar voor elke **ingelogde, gevalideerde gebruiker** (zelfde toegangsniveau als bv. een aanvraag indienen — `get_validated_user`/`get_donateur_or_validated_user`), **niet zichtbaar voor de eigenaar van de aanbieding zelf**.
- Klik opent een klein formulier (dialoog): reden (dropdown, bv. "voldoet niet aan gebruiksvoorwaarden", "misleidende informatie", "ander") + optionele toelichting (vrije tekst, max 500 tekens — analoog aan `SearchRequestMaterialItem.opmerking`).
- Server: `POST /api/listings/{id}/report` — maakt een nieuwe Melding aan met `targetType="listing"`, `targetId=listingId`, `reporterUserId`, `reason`, optionele `note`.
- **Idempotentie/anti-spam**: als er al een **open** Melding van dit type bestaat voor deze combinatie van `listingId` + `reporterUserId`, wordt er geen tweede aangemaakt — de UI toont in plaats daarvan "Je hebt deze aanbieding al gemeld, een admin behandelt dit". Een andere gebruiker kan wel een aparte melding voor dezelfde aanbieding indienen (elke melding blijft zichtbaar, maar er ontstaat geen duplicaat per gebruiker).
- Rate limiting: hergebruik van de bestaande `slimiter`/`limiter` (slowapi, zie `deps.py`) op deze route, zelfde niveau als andere schrijf-acties van gebruikers.
- Geen automatische statuswijziging van de aanbieding — de admin beoordeelt en onderneemt actie via het bestaande admin-aanbiedingenscherm.

### 6.2 Deadline nadert — 7 dagen (`deadline_approaching`)

- Nieuwe scheduled taak (analoog aan `archive_expired_listings` in `backend/tasks.py`, ingepland via dezelfde APScheduler-registratie in `server.py`), bv. `report_upcoming_deadlines(db)`, die dagelijks (zelfde cadans als de bestaande nachtelijke taken) listings zoekt met `status="beschikbaar"`, `isRecurrent=False`, en `deadline` exact 7 kalenderdagen in de toekomst (of "≤ 7 dagen én nog geen Melding van dit type voor deze listing" — zie idempotentie hieronder; de exacte-7-dagen-match is de eenvoudigste eerste implementatie).
- **Idempotentie**: één Melding per aanbieding voor deze trigger. Voorgestelde implementatie: check op bestaan van een Melding met `type="deadline_approaching"` en `targetId=listingId` (ongeacht status open/afgehandeld) vóór aanmaak — een aanbieding met een verlengde/aangepaste deadline die opnieuw binnen 7 dagen komt te liggen, zou in v1 dus geen tweede melding triggeren (bewust aanvaard: zie §12).
- Dit is een **nieuwe** trigger, los van de bestaande gebruikers-notificatie `deadline_expired` (die vuurt pas ná het verlopen van de deadline, niet 7 dagen ervoor, en gaat naar de eigenaar — niet naar admins).

### 6.3 Vervallen zonder herbestemming (`listing_expired_unrehomed`)

- Haakt in op de **bestaande** `archive_expired_listings`-functie in `backend/tasks.py`: op het moment dat een listing van `status="beschikbaar"` naar `status="gearchiveerd"` gaat (dus nooit `herbestemd` werd), wordt naast de bestaande eigenaar-notificatie (`deadline_expired`) ook een Melding aangemaakt voor de admin-groep.
- Eén Melding per archiveringsmoment — geen idempotentie-vraagstuk nodig, want de scheduled taak verwerkt elke listing maar één keer (status gaat van `beschikbaar` naar `gearchiveerd`, geen weg terug binnen dezelfde functie).

### 6.4 Nieuw zoekertje (`new_search_request`)

- Haakt in op `POST /api/search-requests` (in `backend/routes/search_requests.py`, de gebruikersflow — niet de admin-variant `POST /api/admin/search-requests`, want die is al door een admin zelf aangemaakt en hoeft zichzelf niet te melden).
- Eén Melding per aangemaakt zoekertje — geen idempotentie-vraagstuk (elke aanmaak is een unieke gebeurtenis).

### 6.5 Evaluatie met hoge score (`evaluation_high_score`)

- Context: in "Schat of Schroot?" (`backend/routes/game.py`) krijgt een evaluatie (`db.game_evaluations`) punten (`points`) via `$inc` — bij elke stem (+1 stem, zie `votes`) en +3 punten wanneer ze als beste gekozen wordt (`GameChooseBestBody`, regel 262 in `game.py`).
- Trigger: zodra `points` van een evaluatie **> 10** komt te liggen.
- **Idempotentie**: nieuw veld op `game_evaluations`, bv. `adminReported: bool = False`. Bij elke `$inc` op `points` wordt na de update gecontroleerd of `points > 10` en `adminReported` nog `False` is; zo ja, wordt de Melding aangemaakt én `adminReported` op `True` gezet in dezelfde operatie (voorkomt een Melding bij élke volgende stem eens de drempel gehaald is).
- De Melding linkt naar de listing waarop de evaluatie sloeg (`listingId` op `game_evaluations`) én toont de evaluatietekst (`answer1`/`answer2`) zodat de admin niet apart hoeft te zoeken.

### 6.6 Gesprek geblokkeerd (`conversation_blocked`)

- Haakt in op de bestaande `PATCH /api/conversations/{id}/block`-route (`backend/routes/conversations.py`, regel 628-636).
- Melding bevat: wie blokkeerde (`user["id"]`), wie geblokkeerd werd (de andere partij op het gesprek), en een link naar de onderliggende `Application`/listing voor context (zelfde denormalisatie-aanpak als `listingId`/`listingTitle` op bestaande notificaties).
- **Idempotentie**: één Melding per blokkeer-actie is voldoende — een gebruiker die deblokkeert en opnieuw blokkeert genereert een nieuwe, aparte Melding (dat is een nieuwe gebeurtenis, geen herhaling van dezelfde).
- Geen admin-leestoegang tot de gesprekinhoud zelf in v1 (zie ook `PRD_direct_messaging.md` §10) — de Melding linkt naar de betrokken partijen/listing, niet naar de berichten.

## 7. Datamodel (voorstel, aansluitend bij bestaande conventies in `backend/models.py`)

```python
# ---------- Reports (Meldingen) ----------
ReportType = Literal[
    'listing_reported',
    'deadline_approaching',
    'listing_expired_unrehomed',
    'new_search_request',
    'evaluation_high_score',
    'conversation_blocked',
]
ReportStatus = Literal['open', 'afgehandeld']

ReportTargetType = Literal['listing', 'search_request', 'conversation', 'evaluation']


class ListingReportCreateBody(BaseModel):
    """Body voor POST /api/listings/{id}/report — de 'Meld'-knop."""
    model_config = ConfigDict(str_strip_whitespace=True)
    reason: Literal['voorwaarden', 'misleidend', 'ander'] = 'ander'
    note: Optional[str] = Field(None, max_length=500)


class ReportPublic(BaseModel):
    id: str
    type: ReportType
    status: ReportStatus = 'open'
    createdAt: str
    targetType: ReportTargetType
    targetId: str
    targetTitle: Optional[str] = None   # gedenormaliseerd, analoog aan listingTitle op notifications
    message: str                        # samenvattende tekst, kant-en-klaar voor de lijst
    meta: dict = Field(default_factory=dict)  # per-type extra info (reporterUserId, reason, blockerUserId, ...)
    handledByAdminId: Optional[str] = None
    handledAt: Optional[str] = None
```

**Collectie:** `db.reports` — 1 document per Melding, analoog aan `db.notifications` qua vorm maar met een **gedeelde** (niet per-gebruiker) status.

**Wijziging op bestaande collecties:**
- `game_evaluations`: nieuw veld `adminReported: bool = False` (zie §6.5).

## 8. API-routes (voorstel)

| Methode | Route | Toegang | Beschrijving |
|---|---|---|---|
| `POST` | `/api/listings/{id}/report` | Gevalideerde gebruiker, niet de eigenaar | Meld een aanbieding (§6.1) |
| `GET` | `/api/admin/reports` | Admin | Lijst Meldingen, met filters `type`, `status` (querystring) |
| `GET` | `/api/admin/reports/open-count` | Admin | Aantal open meldingen, voor de badge (lichtgewicht, voor de 60 sec-poll) |
| `PATCH` | `/api/admin/reports/{id}/handle` | Admin | Zet status op `afgehandeld`, registreert `handledByAdminId`/`handledAt` |
| `PATCH` | `/api/admin/reports/{id}/reopen` | Admin | Zet status terug op `open` |

De overige 5 triggers (§6.2–6.6) hebben geen eigen publieke route — ze ontstaan server-side vanuit bestaande flows/scheduled taken via een gedeelde helper `create_report(db, type, target_type, target_id, message, target_title=None, meta=None)` in `backend/notifications.py` (of een nieuw `backend/reports.py`, analoog aan de bestaande scheiding tussen `notifications.py` en `tasks.py`), zodat elke trigger dezelfde insert-logica hergebruikt in plaats van los MongoDB-verkeer per call site.

## 9. Niet-functionele requirements

- **Polling, geen WebSocket** — zelfde `POLL_MS = 60_000`-patroon als de bestaande bell-badge, voor het open-aantal in de admin-navigatie.
- **Geen ntfy-push voor Meldingen in v1**: alle 6 triggers zijn in-app-only (Meldingen-pagina + open-aantal-badge). Geen nieuwe `notify_ntfy`-calls toevoegen voor deze fase, ook niet voor de ogenschijnlijk urgentere types (`listing_reported`, `conversation_blocked`) — te heroverwegen in een latere fase als blijkt dat admins de Meldingen-pagina niet snel genoeg checken.
- **Performantie van scheduled taken**: §6.2 en §6.3 draaien binnen de bestaande dagelijkse/nachtelijke APScheduler-jobs in `server.py` — geen nieuwe scheduler-infrastructuur nodig, enkel een extra job-registratie naast de bestaande (`archive_expired_listings`, `mark_inactive_orgs`, ...).
- **Taal**: alle Melding-teksten (`message`) worden server-side in het Nederlands gerenderd (zelfde als bestaande in-app-notificaties, die ook niet vertaald worden) — het admin-panel is intern Nederlandstalig; geen i18n-vereiste voor Meldingen zelf.

## 10. Privacy & GDPR

- `reporterUserId` (§6.1) en `blockerUserId`/`blockedUserId` (§6.6) zijn zichtbaar voor admins binnen de Melding — dit is bestaand gedrag qua gevoeligheid (admins zien vandaag ook al wie een aanvraag indient, wie een gesprek voert, enz.), geen nieuwe categorie van gevoelige data.
- Geen automatische retentie/verwijdering van Meldingen in v1 (in tegenstelling tot notificaties, die na 30 dagen automatisch verdwijnen) — een team-overzicht van afgehandelde gebeurtenissen heeft historische waarde. **Te doen los van deze PRD**: het privacybeleid vermelden dat meldingsgegevens (o.a. wie een melding indiende) bewaard blijven voor administratief gebruik.

## 11. Out of scope voor v1

- Bulk-acties op de Meldingen-pagina (bv. "alles afhandelen").
- Automatische acties vanuit een Melding (bv. aanbieding automatisch offline halen bij een `listing_reported`-melding).
- Migratie van de bestaande admin-notificaties (`contact_message`, `new_registration`) naar `db.reports` — blijven voorlopig in `db.notifications` zoals vandaag (zie §3).
- E-maildigest voor Meldingen (analoog aan de berichten-digest in `PRD_direct_messaging.md`) — enkel in-app + beperkte ntfy-push (§9) in v1.
- Toewijzen van een Melding aan een specifieke admin ("ik neem dit op mij") — status is binair (open/afgehandeld), geen owner-veld.
- Reactie/notitie van de admin bij het afhandelen (bv. "reden van afwijzing") — enkel de statuswissel zelf in v1.
- Herhaalde `deadline_approaching`-melding bij een verlengde deadline die opnieuw binnen 7 dagen komt te liggen (zie §12, aanvaard risico).

## 12. Aanvaarde risico's

1. **Deadline-verlenging na melding**: als een aanbieding al een `deadline_approaching`-melding kreeg, en de eigenaar verlengt nadien de deadline zodanig dat ze opnieuw binnen 7 dagen komt te liggen, verschijnt er in v1 **geen tweede** melding (de idempotentie-check in §6.2 kijkt enkel naar "bestaat er al ooit een melding van dit type voor deze listing", niet naar "voor déze specifieke deadline-waarde"). Impact wordt laag ingeschat: deadline-verlenging vlak vóór het verlopen is een randgeval, en de bestaande `deadline_expired`-notificatie (naar de eigenaar) blijft sowieso werken als vangnet.
2. **`deadline_approaching`-timing**: de voorgestelde "exact 7 dagen"-match (§6.2) mist een listing als de scheduled taak een dag overslaat (bv. bij downtime). Te herzien naar een "≤ 7 dagen én nog geen melding"-variant indien dit in de praktijk voorkomt.

## 13. Rollout-suggestie

1. Backend: `db.reports`-collectie + datamodel + gedeelde `create_report`-helper + `GET`/`PATCH`-routes voor admin.
2. Backend: 6 triggers stuk voor stuk aankoppelen (§6.1–6.6), te beginnen met de eenvoudigste (nieuw zoekertje, vervallen-zonder-herbestemming — beide hergebruiken bestaande call sites) vóór de meer bewerkelijke (meld-knop UI, scheduled deadline-taak, evaluatie-score-hook).
3. Frontend: "Meld"-knop op de aanbiedingdetailpagina + dialoog (§6.1).
4. Frontend: `AdminMeldingen.jsx`-pagina + navigatielink met open-aantal-badge (§4).
5. Interne test met de bestaande admin-accounts vóór volledige uitrol.
6. Meten: tijd tussen gebeurtenis en het moment waarop een admin de Melding afhandelt, per type — geeft een eerste beeld van welke triggers effectief opgevolgd worden en welke ruis blijken te zijn.

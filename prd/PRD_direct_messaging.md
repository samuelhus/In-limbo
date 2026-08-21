# PRD — Direct Messaging tussen aanbieder en aanvrager

**Status:** Concept — v1 scope
**Auteur:** Samuel (product) + Claude (co-auteur)
**Datum:** 2026-08-20
**Repo:** In-limbo

---

## 1. Probleemstelling

Vandaag verloopt de afhandeling van een aanbieding via het **Application**-model: een aanvrager dient een aanvraag in met een motivatie (`ApplicationCreate.motivation`) en een gevraagde hoeveelheid. De aanbieder kiest daaruit een winnaar (`SelectApplicantBody`). Tussen "aanvraag indienen" en "toewijzen" is er echter **geen kanaal om details uit te klaren**: staat van het materiaal, specificiteiten, transport/afhaling. Partijen wijken hiervoor waarschijnlijk uit naar e-mail of telefoon, buiten het platform — waardoor In-limbo geen zicht (en geen data) heeft op waarom matches wel of niet lukken, en de afhandeling trager verloopt dan nodig.

## 2. Doel & succescriteria

Deze feature moet bijdragen aan:

1. **Meer succesvolle matches** — minder aanvragen die verzanden doordat details niet uitgeklaard raken. Metric: % aanvragen met minstens 1 bericht dat resulteert in "selected" vs. aanvragen zonder gesprek.
2. **Snellere afhandeling** — kortere tijd tussen aanvraag en toewijzing. Metric: mediane tijd tussen `ApplicationCreate` en `SelectApplicantBody`, voor/na lancering.

Niet-doel (expliciet uitgesloten als primair doel voor v1): platform-wide adoptie van chat als vervanging voor alle communicatie, of het volledig elimineren van externe communicatie — dat is een prettige bijkomstigheid, geen v1-KPI.

## 3. Gebruikersrollen & privacyregel

| Rol | Kan een gesprek starten? | Kan berichten sturen? |
|---|---|---|
| **Aanvrager** | ❌ Nee — kan geen DM starten naar een aanbieder | ✅ Ja, maar pas **nadat** de aanbieder het gesprek geopend heeft |
| **Aanbieder** | ✅ Ja — enkel met wie een formele Aanvraag (`Application`) indiende op zijn/haar listing | ✅ Ja, als eerste (initieert het gesprek) |

**Kernregel (privacy-by-design):** contactgegevens en directe communicatie worden pas mogelijk nadat de aanbieder actief de keuze maakt om in gesprek te gaan met een specifieke aanvrager. Dit voorkomt ongewenste/koude contactname van aanvrager naar aanbieder, en houdt de aanbieder in controle over wie toegang krijgt tot een gesprek.

Na de eerste boodschap van de aanbieder is het gesprek **volledig symmetrisch**: beide partijen kunnen vrij verder berichten uitwisselen. Er is geen doorlopende moderatorrol voor de aanbieder — de asymmetrie geldt uitsluitend voor het *initiëren* van het allereerste contact.

## 4. Scope van een gesprek (Conversation)

Een gesprek (**Conversation**) is gekoppeld aan één specifieke **Application** (dus impliciet aan één listing + één aanvrager-aanbieder-paar). Dit betekent:

- Eén aanbieder kan **parallelle, aparte gesprekken** voeren met meerdere aanvragers op dezelfde listing (elke Application kan zijn eigen Conversation krijgen).
- Wanneer dezelfde twee partijen later opnieuw met elkaar te maken krijgen (nieuwe listing, nieuwe aanvraag), ontstaat een **nieuw, apart gesprek** — geen permanente, listing-overschrijdende inbox tussen twee accounts.
- **Belangrijk:** een gesprek wordt **niet automatisch gesloten of read-only**, ongeacht wat er met de onderliggende Application gebeurt — of de listing nu toegewezen wordt aan een andere aanvrager, de status naar `not_selected` gaat, of de aanvrager de Application zelf intrekt (`withdrawn`). In alle gevallen blijft het gesprek gewoon bestaan en bruikbaar. Dit is een bewuste keuze: eenvoud voor de gebruiker (en één simpele regel, geen uitzonderingen per status) weegt hier zwaarder dan strikte handhaving van de listing-levenscyclus op het gesprek.

## 5. User stories

1. *Als aanvrager* dien ik een aanvraag in met motivatie op een listing (bestaande flow, ongewijzigd).
2. *Als aanbieder* zie ik bij elke binnengekomen aanvraag een knop **"Start gesprek"**.
3. *Als aanbieder* open ik een gesprek en stuur ik een eerste bericht (bv. "Kan je me meer vertellen over hoe je het materiaal gaat vervoeren?").
4. *Als aanvrager* krijg ik een melding dat er een nieuw gesprek/bericht is, en kan ik vrij antwoorden.
5. *Als gebruiker* (beide rollen) zie ik in de hoofdnavigatie een tab **"Berichten"** met een badge/icoon bij ongelezen berichten, analoog aan de bestaande meldingen-tab.
6. *Als gebruiker* kan ik foto's en bestanden (bv. technische fiche, extra foto van de staat) toevoegen aan een bericht.
7. *Als gebruiker* kan ik de andere partij blokkeren als het gesprek ongepast wordt.
8. *Als gebruiker* kan ik een gesprek bij mezelf verwijderen/archiveren (verdwijnt uit mijn lijst; de andere partij behoudt het gesprek).
9. *Als gebruiker* krijg ik een e-mail bij een nieuw bericht (naast de in-app badge).

## 6. Functionele requirements

### 6.1 Gesprek starten
- Enkel toegankelijk voor de aanbieder van de listing, en enkel richting een gebruiker die een `Application` heeft ingediend op die listing.
- Eén Conversation per Application (1-op-1 relatie) — voorkomt dubbele gesprekken over dezelfde aanvraag.
- Aanbieder kan pas een 2de gesprek starten met een andere aanvrager op dezelfde listing als die een aparte Application heeft ingediend (staat al toe via bestaande multi-Application-flow).

### 6.2 Berichten
- Tekstbericht (verplicht veld, met een redelijke max-length — voorstel: 2000 tekens, analoog aan de 500-tekens-limiet op `ApplicationCreate.motivation` maar ruimer omdat het een doorlopend gesprek is).
- Optioneel: foto's en/of bestanden (PDF, technische fiche, …) als bijlage bij een bericht.
- **Limiet is per gesprek, niet per bericht**: maximaal **5 foto's/bestanden in totaal** en maximaal **20 MB in totaal** per Conversation (cumulatief over alle berichten in dat gesprek samen).
- Wanneer een partij deze limiet zou overschrijden, weigert de server de upload en toont de UI een melding die voorstelt om verder uit te wisselen via e-mail — bewuste keuze om de scope van bijlagen klein te houden zonder de gebruiker volledig te blokkeren.
- Berichten zijn onveranderlijk na versturen (geen "bewerken" in v1) — enkel verwijderen van het eigen gesprek is voorzien (zie 6.5), niet het aanpassen van individuele berichten.

### 6.3 Hoofdnavigatie & badge
- Nieuwe navigatietab **"Berichten"**, analoog aan de bestaande "Meldingen"-tab qua UI-patroon (icoon + rode badge met ongelezen-aantal).
- Badge toont het **aantal gesprekken** met ongelezen berichten (niet het totaal aantal ongelezen berichten) — consistenter en minder opgeblazen dan een oplopende teller bij een druk gesprek met veel losse berichtjes.
- Berichtenlijst toont: naam tegenpartij, listingtitel (voor context), laatste berichtfragment, tijdstip, ongelezen-indicator.

### 6.4 Blokkeren
- Elke partij kan de andere blokkeren, per gesprek (niet platform-breed in v1 — platform-brede blokkade zou een apart, zwaarder mechanisme vergen).
- Geblokkeerde partij kan geen nieuwe berichten meer sturen in dat gesprek; bestaande geschiedenis blijft zichtbaar voor beide.
- Geen ingebouwde "meld dit gesprek naar admin"-knop in v1 — meldingen van misbruik verlopen voorlopig via het bestaande contactformulier/e-mail naar admins.

### 6.5 Verwijderen/archiveren
- "Verwijderen" is **per gebruiker** (soft-delete/hide): het gesprek verdwijnt uit de lijst van de gebruiker die verwijdert, maar blijft volledig intact voor de andere partij.
- Als de verwijderde partij achteraf opnieuw een bericht ontvangt in dat gesprek, verschijnt het gesprek terug in hun lijst (zoals bij e-mail-archivering).

### 6.6 Notificaties
- **In-app**: nieuw record in het bestaande `notifications`-systeem (hergebruik van `create_notification`), zichtbaar via badge op de "Berichten"-tab én (optioneel) in de bestaande Meldingen-tab.
- **E-mail**: transactionele mail via Resend bij een nieuw bericht — met **debounce + "alleen als nog ongelezen"-logica**, hergebruik makend van de bestaande `APScheduler` (nu al gebruikt voor de nachtelijke taken en de dagelijkse fotoherinnering in `backend/server.py`), zodat geen nieuwe job-infrastructuur nodig is:
  1. Bij een nieuw bericht wordt géén mail verstuurd. Op de Conversation wordt voor de ontvanger een tijdstempel `unreadSince` gezet — enkel als er nog geen lopende ongelezen-periode was (dus niet overschreven bij een 2de, 3de bericht in dezelfde burst).
  2. Een scheduled job (elke ~5 min) doorzoekt gesprekken waar `unreadSince` ouder is dan **30 minuten** en waarvoor nog geen mail verstuurd is voor déze ongelezen-periode.
  3. Op dat moment wordt gecontroleerd of de ontvanger het gesprek intussen gelezen heeft. Zo ja: geen mail (overslaan). Zo nee: **één** mail met alle berichten sinds `unreadSince` gebundeld, en `emailSentAt` wordt vastgelegd zodat deze periode niet nogmaals een mail triggert.
  4. Zodra de ontvanger het gesprek leest, wordt `unreadSince` gereset. Een volgend bericht start een nieuwe cyclus.
  5. **Geen herhaalde herinneringsmails** — als de ontvanger na die ene mail nog steeds niet reageert (uren, dagen later), wordt er bewust geen 2de/3de mail gestuurd voor dezelfde ongelezen-periode. Simpelste gedrag voor v1; te herzien indien blijkt dat berichten hierdoor gemist worden.
- ntfy-push: **niet meegenomen in v1** (niet gekozen door product owner) — kan later toegevoegd worden analoog aan de bestaande listing-topic.

## 7. Datamodel (voorstel, aansluitend bij bestaande conventies in `backend/models.py`)

```python
# ---------- Conversations & Messages ----------
class ConversationCreate(BaseModel):
    applicationId: str  # 1-op-1 gekoppeld aan een Application

class ConversationPublic(BaseModel):
    id: str
    applicationId: str
    listingId: str
    offererUserId: str      # aanbieder — degene die het gesprek mag starten
    requesterUserId: str    # aanvrager
    createdAt: str
    lastMessageAt: Optional[str] = None
    lastMessagePreview: Optional[str] = None
    # per-gebruiker status, server-side afgeleid — niet letterlijk zo opgeslagen,
    # maar in de serialisatie berekend t.o.v. de ingelogde gebruiker:
    unreadCount: int = 0
    blockedByMe: bool = False
    blockedByOther: bool = False
    hiddenByMe: bool = False
    # cumulatieve bijlage-limiet per gesprek (zie 6.2) — server-beheerd, opgeteld
    # bij elk nieuw bericht met photos/files, gecheckt vóór het bericht wordt aanvaard:
    attachmentCount: int = 0   # max 5
    attachmentBytes: int = 0  # max 20_971_520 (20 MB)


# Per-partij e-mail-throttling state, opgeslagen op het Conversation-document
# (offerer/requester i.p.v. een generieke map, analoog aan offererUserId/requesterUserId):
#   offererUnreadSince:   Optional[str]   # ISO-timestamp; None = geen lopende ongelezen-periode
#   offererEmailSentAt:   Optional[str]   # ISO-timestamp van laatst verstuurde mail voor die periode
#   requesterUnreadSince: Optional[str]
#   requesterEmailSentAt: Optional[str]
# Scheduled job query (elke ~5 min): unreadSince != None, ouder dan 30 min,
# en (emailSentAt is None OF emailSentAt < unreadSince).


class MessageCreate(BaseModel):
    text: str = Field(..., max_length=2000, min_length=1)
    photos: List[str] = Field(default_factory=list)
    files: List[str] = Field(default_factory=list)
    # Geen harde per-bericht max_length hier: de echte grens is cumulatief op
    # Conversation-niveau (attachmentCount <= 5, attachmentBytes <= 20 MB, zie
    # ConversationPublic hierboven). Bij overschrijding: 4xx met een foutmelding
    # die de UI vertaalt naar "gelieve verder uit te wisselen via e-mail".


class MessagePublic(BaseModel):
    id: str
    conversationId: str
    senderId: str
    text: str
    photos: List[str] = Field(default_factory=list)
    files: List[str] = Field(default_factory=list)
    createdAt: str
    readAt: Optional[str] = None
```

**Collecties (MongoDB, analoog aan bestaande `db.applications`, `db.notifications`):**
- `db.conversations` — 1 document per Conversation, inclusief `blockedBy: [userId]` en `hiddenBy: [userId]` arrays voor blok-/verwijderstatus per partij.
- `db.messages` — 1 document per bericht, met `conversationId`-index.

## 8. API-routes (voorstel)

| Methode | Route | Beschrijving |
|---|---|---|
| `POST` | `/api/conversations` | Start een gesprek vanaf een `applicationId` (enkel toegelaten voor de aanbieder van die listing) |
| `GET` | `/api/conversations/mine` | Lijst van mijn gesprekken (met unreadCount, laatste bericht) |
| `GET` | `/api/conversations/{id}/messages` | Berichten van een gesprek (paginated) |
| `POST` | `/api/conversations/{id}/messages` | Nieuw bericht versturen |
| `PATCH` | `/api/conversations/{id}/read` | Markeer gesprek als gelezen |
| `PATCH` | `/api/conversations/{id}/block` | Blokkeer de andere partij |
| `PATCH` | `/api/conversations/{id}/unblock` | Deblokkeer |
| `DELETE` | `/api/conversations/{id}` | Verberg gesprek voor mezelf (soft-delete) |

Autorisatie-logica leunt sterk op de bestaande `Application`-relatie: enkel `offererUserId` en `requesterUserId` van de onderliggende Application hebben toegang tot een Conversation.

## 9. Niet-functionele requirements

- **Polling, geen WebSocket in v1** — sluit aan bij de bestaande architectuur (meldingen worden nu ook periodiek opgehaald via `setInterval`, `POLL_MS = 60_000` in `NotificationCenter.jsx`; geen WebSocket-infra aanwezig in `docker-compose.yml`). Twee snelheden:
  - **Elders in de app** (Berichten-tab niet open): zelfde 60 sec-interval als de bestaande meldingen — een nieuw bericht is dus tot 60 sec (gemiddeld 30 sec) zichtbaar via de badge.
  - **In een open gesprek**: kortere interval van **10–15 seconden**, enkel actief zolang die pagina open staat — voldoende voor het rustige, B2B-achtige gebruik dat hier verwacht wordt (geen instant-chat-verwachting).
- **Rate limiting**: eenvoudige server-side throttle op berichten per gebruiker per minuut, om spam/misbruik te beperken (geen zware infra nodig — simpele counter volstaat voor v1-volumes).
- **Opslag foto's/bestanden**: hergebruik van bestaande upload-infrastructuur (zelfde als listing-foto's/technicalFiles).
- **Taal**: berichten zelf zijn vrije tekst — gebruikers zijn vrij om te schrijven in eender welke taal (NL, FR, of anders), er is bewust geen vertaal- of taaldetectiefunctie. Enkel de UI-labels rond het gesprek (knoppen, systeemberichten) volgen de bestaande `preferredLanguage`-aanpak.

## 10. Privacy & GDPR

- Berichten worden **onbeperkt bewaard** in v1 — geen automatische retentie-verwijdering.
- Gebruikers kunnen hun *eigen zicht* op een gesprek verwijderen (zie 6.5), maar dit is geen GDPR-verwijdering van data — de andere partij en de database behouden het gesprek.
- **Te doen los van deze PRD**: het privacybeleid van het platform moet vermelden dat berichten worden bewaard en tussen partijen uitgewisseld, en welke rechten een gebruiker heeft (bv. een expliciet verzoek tot volledige verwijdering via de admin, buiten de zelfbedieningsfunctie om).
- Geen platformbrede admin-leestoegang tot gesprekken voorzien in v1 (niet gekozen door product owner) — bij een geschil zou dit dus via een uitzonderlijke, buiten-de-app-procedure moeten (bv. gebruiker stuurt screenshot naar admin).

## 11. Out of scope voor v1

- Permanent/listing-overschrijdend contact tussen partners.
- Gedeelde organisatie-inbox (meerdere personen per account in hetzelfde gesprek).
- Real-time (WebSocket) berichten.
- "Meld dit gesprek"-knop naar admins.
- Admin-leestoegang tot gesprekken.
- Automatische retentie/verwijdering van berichten.
- ntfy-pushnotificaties voor berichten.
- Bewerken van reeds verzonden berichten.
- Platformbrede blokkade (blokkeren geldt enkel per gesprek).

## 12. Aanvaarde risico's

Alle openstaande productbeslissingen zijn ondertussen gemaakt (zie secties hierboven, incl. het `withdrawn`-scenario in sectie 4). Wat overblijft is een bewust aanvaard risico, geen open vraag:

1. **Foto's/bestanden-moderatie**: geen virusscanning/contentmoderatie voorzien in v1 — zelfde risiconiveau als bestaande listing-uploads. De cumulatieve limiet van 5 bijlagen / 20 MB per gesprek (zie 6.2) beperkt sowieso de impact van misbruik via bijlagen.

## 13. Rollout-suggestie

1. Backend: datamodel + API-routes + notificatie-integratie.
2. Frontend: Berichten-tab in hoofdnav + badge, gespreklijst, gespreksvenster (tekst), foto/bestand-upload, blokkeer-/verwijderknoppen.
3. E-maildigest-logica.
4. Interne test met een kleine groep aanbieders/aanvragers vóór volledige uitrol.
5. Meten: % aanvragen met gesprek → geselecteerd, en mediane tijd-tot-toewijzing, voor/na.

# Prompts voor Claude Code — Direct Messaging feature

Gebruik deze prompts in volgorde, elk in een (nieuwe of vervolg-) `claude`-sessie
in de root van de repo. Laat Claude Code steeds eerst een plan tonen (`/plan`
of gewoon vragen "maak eerst een plan") vóór het effectief codeert, zodat je
tussentijds kan bijsturen. Review en test elke fase vóór je naar de volgende gaat.

---

## Introductieprompt (eenmalig, aan het begin)

```
Lees PRD_direct_messaging.md volledig — dit is de product requirements
voor een nieuwe direct-messaging feature tussen aanbieders en
aanvragers van listings. We gaan deze feature in fases bouwen, elke
fase in een aparte prompt die ik je geef.

Voor je begint: geef me een korte samenvatting van hoe je de bestaande
codebase-conventies interpreteert die relevant zijn voor deze feature
— bv. hoe models.py, de routes-structuur, en het notifications-systeem
nu in elkaar zitten — zodat ik kan bevestigen dat je aanpak aansluit
bij de rest van de codebase vóór we starten met fase 1.

Nog niet coderen in deze prompt, enkel verkennen en samenvatten.
```

---

## Fase 1 — Datamodel + basis API (backend)

```
We beginnen met fase 1 van de direct-messaging feature uit
PRD_direct_messaging.md: enkel het datamodel en de basis API-routes.

Scope van deze fase:
- Conversation- en Message-modellen in backend/models.py, aansluitend
  bij de bestaande stijl (zie sectie 7 van de PRD als richtlijn, maar
  volg de conventies die je al in models.py ziet indien die afwijken).
- De basis API-routes uit sectie 8 van de PRD: gesprek starten vanaf
  een applicationId, berichten ophalen (paginated), bericht versturen,
  gesprek markeren als gelezen.
- Autorisatie: enkel de offerer en requester van de onderliggende
  Application mogen bij een Conversation.

Expliciet NIET in deze fase: bijlagen (foto's/bestanden), blokkeren,
verwijderen/archiveren, notificaties, e-mail, frontend.

Maak eerst een plan (welke bestanden, welke nieuwe routes, hoe je het
test) voordat je begint te coderen.
```

---

## Fase 2 — Bijlagen (foto's/bestanden)

```
Fase 2: bijlagen bij berichten, zoals beschreven in sectie 6.2 en 7
van PRD_direct_messaging.md.

Scope:
- photos/files toevoegen aan MessageCreate.
- Cumulatieve limiet per Conversation (niet per bericht!): max 5
  foto's/bestanden totaal, max 20 MB totaal. Track dit via
  attachmentCount/attachmentBytes op het Conversation-document,
  bijgewerkt bij elk nieuw bericht met bijlage.
- Bij overschrijding: de server weigert het bericht met een duidelijke
  foutmelding (4xx) die de frontend kan tonen als "gelieve verder uit
  te wisselen via e-mail".
- Hergebruik de bestaande upload-infrastructuur die nu al gebruikt
  wordt voor listing-foto's/technicalFiles — zoek zelf op hoe die
  precies werkt in de codebase vóór je iets nieuws opzet.

Bouwt voort op fase 1. Maak eerst een kort plan.
```

---

## Fase 3 — Blokkeren & verwijderen

```
Fase 3: blokkeren en verwijderen/archiveren van gesprekken, sectie 6.4
en 6.5 van PRD_direct_messaging.md.

Scope:
- Blokkeerfunctie per gesprek (niet platformbreed): elke partij kan de
  andere blokkeren; een geblokkeerde partij kan geen nieuwe berichten
  meer sturen in dat specifieke gesprek. Geschiedenis blijft zichtbaar.
- Verwijderen is per gebruiker (soft-delete/hide): het gesprek
  verdwijnt uit de lijst van wie verwijdert, blijft intact voor de
  andere partij, en verschijnt terug zodra er een nieuw bericht
  binnenkomt.

Routes: PATCH .../block, PATCH .../unblock, DELETE .../{id} zoals in
sectie 8. Bouwt voort op fase 1, onafhankelijk van fase 2.
```

---

## Fase 4 — In-app notificaties

```
Fase 4: koppel nieuwe berichten aan het bestaande in-app
notificatiesysteem.

Zoek op hoe create_notification (backend/notifications.py) nu gebruikt
wordt bij vergelijkbare events (bv. nieuwe Application), en gebruik
hetzelfde patroon om een notificatie aan te maken voor de ontvanger bij
elk nieuw bericht. Dit is de basis voor de badge die in een latere
(frontend-)fase komt.

Hou rekening met blokkade uit fase 3: geen notificatie versturen als
de ontvanger de afzender geblokkeerd heeft (al kan dat sowieso niet
gebeuren aangezien blokkade nieuwe berichten van de afzender weigert).

Bouwt voort op fase 1 en 3.
```

---

## Fase 5 — E-mail throttle-job

```
Fase 5: de e-mail-notificatielogica uit sectie 6.6 van
PRD_direct_messaging.md.

Scope:
- Bij een nieuw bericht: geen synchrone mail, enkel unreadSince zetten
  op de Conversation voor de ontvanger (enkel als er nog geen lopende
  ongelezen-periode was).
- Nieuwe scheduled job op de bestaande APScheduler in backend/server.py
  (zoek op hoe de bestaande jobs daar precies geregistreerd worden,
  bv. de nachtelijke taak en de fotoherinnering, en volg dat patroon).
  Deze job draait elke ~5 minuten en zoekt gesprekken waar unreadSince
  ouder is dan 30 minuten en waarvoor nog geen mail verstuurd is voor
  die ongelezen-periode.
- Bij versturen: controleer eerst of het gesprek intussen gelezen is
  (skip zo ja), bundel anders alle berichten sinds unreadSince in één
  mail via de bestaande send_email-helper, en zet emailSentAt.
- Bij het lezen van een gesprek: reset unreadSince.
- Geen herhaalde herinneringsmails — max 1 mail per ongelezen-periode.

Bouwt voort op fase 1. Test met een korte tijdelijke vertraging (bv.
1 minuut i.p.v. 30) om het gedrag snel te kunnen verifiëren, en zet
daarna terug naar 30 minuten.
```

---

## Fase 6 — Frontend: Berichten-tab + badge

```
Fase 6: nieuwe navigatietab "Berichten" in de hoofdnavigatie, sectie
6.3 van PRD_direct_messaging.md.

Scope:
- Nieuwe tab naast de bestaande "Meldingen"-tab, zelfde UI-patroon
  (zoek op hoe Header.jsx en NotificationCenter.jsx dit nu doen).
- Badge toont het aantal gesprekken met ongelezen berichten (niet het
  totaal aantal berichten).
- Polling elke 60 seconden wanneer de gebruiker niet actief in een
  gesprek zit (zelfde interval als de bestaande NotificationCenter,
  POLL_MS = 60_000).

Nog geen gespreklijst of -venster in deze fase, enkel de tab + badge
die het aantal ophaalt via de fase 1-route.
```

---

## Fase 7 — Frontend: gespreklijst + gespreksvenster

```
Fase 7: de eigenlijke chat-UI, voortbouwend op fase 6.

Scope:
- Gespreklijst: naam tegenpartij, listingtitel (voor context), laatste
  berichtfragment, tijdstip, ongelezen-indicator per gesprek.
- Gespreksvenster: berichten tonen/versturen, met snellere polling
  (10-15 sec) zolang dit venster actief openstaat.
- "Start gesprek"-knop bij een binnengekomen Aanvraag, zichtbaar voor
  de aanbieder — zoek op waar Applications nu getoond worden aan de
  aanbieder (listings-detail of dashboard) en voeg de knop daar toe.

Bouwt voort op fase 1 en 6.
```

---

## Fase 8 — Frontend: bijlagen, blokkeren, verwijderen

```
Fase 8: koppel de backend uit fase 2 en 3 aan de UI.

Scope:
- Foto/bestand-upload in het gespreksvenster, met duidelijke feedback
  wanneer de cumulatieve limiet (5 stuks / 20 MB) bereikt is —
  toon dan de melding om verder uit te wisselen via e-mail.
- Blokkeerknop in het gespreksvenster, met bevestigingsdialoog.
- Verwijderen/archiveren-knop in de gespreklijst (bv. bij hover of via
  een contextmenu, consistent met hoe dat elders in de app al werkt).

Bouwt voort op fase 2, 3 en 7.
```

---

## Fase 9 — Testen & interne rollout

```
Fase 9: afronding, sectie 13 van PRD_direct_messaging.md.

Vraag me welke tests je zelf kan schrijven/uitvoeren (bv. backend
unit-/integratietests voor de nieuwe routes en de throttle-job-logica),
en stel voor welke handmatige testscenario's ik zelf zou moeten
doorlopen vóór een interne rollout naar een kleine groep gebruikers
(bv. het volledige pad: aanvraag -> gesprek starten -> berichten ->
bijlagelimiet bereiken -> blokkeren -> verwijderen).

Stel ook voor hoe we de succescriteria uit sectie 2 van de PRD (% aanvragen
met gesprek -> geselecteerd, tijd-tot-toewijzing) meetbaar maken —
bv. welke velden/logging daarvoor nodig zijn.
```

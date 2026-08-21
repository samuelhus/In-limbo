# PRD — Schat of Schroot? / Trash ou Trésor ?

**Versie:** 0.4 (functioneel compleet)
**Auteur:** Samuel
**Status:** draft — klaar voor technisch ontwerp
**Platform:** In Limbo (inlimbo.brussels)

---

## 1. Doel & context

**Probleem:** Listings op In Limbo zonder bestemming blijven liggen. Er is geen structurele manier om snel, in bulk, in te schatten wat de herbestemmingswaarde van een object is en wie ermee geholpen zou kunnen zijn.

**Oplossing:** Een swipe-gebaseerd browserspel waarin gebruikers listings zonder bestemming beoordelen op inspiratiewaarde, en voor de meest kansrijke items suggesties geven over gebruik en doelgroep. Een admin kan een evaluatie valideren, wat betekent dat de listing effectief naar een specifieke bestemming is opgestuurd.

**Succes-metrics**
- % listings zonder bestemming dat minstens 1 evaluatie krijgt
- % geëvalueerde listings dat effectief gevalideerd wordt door een admin (= echte match)
- Aantal actieve spelers per maand / retentie
- Gemiddeld aantal reeksen gespeeld per gebruiker

---

## 2. Doelgroep & toegang

- **Publiek toegankelijk**, geen minimumleeftijd, geen koppeling met bestaande In Limbo-gebruikersaccounts. Spellogin is een volledig **losstaand account-systeem** (eigen username/email-tabel, niet gelinkt aan de platform-userdatabase).
- **Distributie**: momenteel enkel bereikbaar via een link in het admin-tabblad. Op termijn: widget op de landingspagina met link naar het spel.
- **Taal**: geen in-game taalwissel-knop. Taal wordt bepaald door welke link gebruikt wordt — aparte NL-link en FR-link (bv. `/spel/nl` en `/spel/fr`).

---

## 3. Registratie & login

- Velden: username, email.
- **Nieuwe username** → account aangemaakt met opgegeven email, direct spelen.
- **Bestaande username + zelfde email** → login (email = wachtwoord).
- **Bestaande username + ander email** → foutmelding "Username al in gebruik".
- **Eén email mag meerdere usernames hebben** (geen 1-op-1-relatie email↔username).
- **Geen wachtwoord-reset.** Verlies je toegang tot je email, dan verlies je toegang tot die username — geaccepteerd risico, geen recovery-flow te bouwen.
- **Geen e-mailverificatie voorzien** — email fungeert puur als toegangssleutel, niet als geverifieerd identiteitsbewijs. *(Aandachtspunt: zonder verificatie + zonder reset is dit een zwakke authenticatie — laag risico gezien lage inzet van het spel, maar niet geschikt om te hergebruiken voor iets gevoeligers.)*
- Email is voor alle spelers verborgen (nooit publiek zichtbaar, ook niet op leaderboards).
- **GDPR**: consent bij registratie + mogelijkheid tot verwijdering/anonimisering van een gebruiker en diens data (admin-actie, hergebruik van bestaande `anonymize_user()`-logica uit het hoofdplatform).

---

## 4. Spelverloop

### 4.1 Interactie
- **Swipe**: klik-en-sleep de kaart, of klik op een van de twee pijlen (ook op desktop/browser).
  - **Linkerpijl** (richting links) = vuilbak-icoon = "geen inspiratie".
  - **Rechterpijl** (richting rechts) = lamp-icoon = "inspirerend".
- Swipe-animatie bij elke actie.
- Bij swipe rechts: foto verkleint tot **net genoeg ruimte** voor vraag + tekstveld eronder (geen volledige minimalisatie).
- Tabblad/venster is een **normale browser-breedte**, niet geforceerd naar telefoonformaat (correctie t.o.v. eerdere aanname).
- Confetti-animatie bij het afronden van een evaluatie.
- Geluidseffecten: aan/uit-knop naast het info-icoon, **standaard aan**.

### 4.2 Evaluatie
1. Foto van listing, swipe/klik links of rechts.
2. Rechts (inspirerend) → vraag 1 "Wat kan je ermee doen?" (verplicht, geen lege velden toegelaten) → enter.
3. Vraag 2 "Wie kan dit gebruiken?" (verplicht) → enter → evaluatie compleet → **+1 punt**.
4. **Elke speler kan een specifieke listing max. 1 keer evalueren** — bij een herhaalde sessie komt een reeds geëvalueerde listing niet meer terug voor diezelfde speler.
5. **Eerste evaluator** van een listing → automatisch door naar volgende listing in de reeks.
6. **Niet eerste evaluator** → ziet top-evaluaties (bij ex aequo: **alle** ex-aequo-evaluaties tonen, niet beperkt tot 2) + eigen zonet ingevulde evaluatie → kiest de beste.
   - Gekozen evaluatie (indien niet de eigen) → **+3 punten** (verhoogd t.o.v. het +1 voor invullen, om kwaliteit te belonen).
   - Eigen evaluatie kiezen → geen extra punt.
   - **Deze keuze is definitief** — geen bevestigingsstap, geen wijziging achteraf.
7. **Max. 20 evaluaties per listing.** Zodra dat aantal bereikt is, valt de listing automatisch uit de random-selectiepool (los van eventuele manuele verwijdering door een admin of validatie).
8. **Geen zichtbare koppeling tussen listing-eigenaar en speler** — een speler kan niet zien (en het systeem toont niet) of een listing van hemzelf is.

### 4.3 Reeksen
- Selectie van de 6 listings per reeks: **volledig random**.
- **Minder dan 6 beschikbare listings over** → reeks stopt vroeger dan 6 en speler gaat direct naar het scorebord.
- **Geen dagelijkse speellimiet** — speler kan doorspelen tot alle beschikbare (niet naar-links-geswipete, niet reeds door hem geëvalueerde) listings op zijn.
- **Netwerkfout tijdens een evaluatie**: ingevulde info gaat verloren, geen auto-save/recovery voorzien (geaccepteerd voor v1).

---

## 5. Scoring & leaderboards

- +1 punt bij het volledig invullen van een evaluatie.
- +3 punten wanneer je evaluatie door een andere speler als beste gekozen wordt.
- **Algemeen leaderboard: maandelijks**, plus een **all-time leaderboard** ernaast (beide zichtbaar).
- Per-listing leaderboard: evaluatie(s) met de meeste stemmen (rekening houdend met ex aequo).
- **Verwijdering van een listing** (bv. door admin uit de pool gehaald) → punten die spelers er al voor verdiend hebben **blijven staan**, geen retroactieve correctie.

---

## 6. Admin panel

- Lijst gebruikers (username + email) + statistieken per speler.
- Statistieken per listing.
- Top evaluaties.
- **Moderatie**: admins kunnen evaluaties modereren (bv. verbergen bij ongepaste inhoud).
- **Listing uit spelpool halen** — bv. ondertussen elders gematcht, of niet geschikt voor het spel.
- **Evaluatie valideren**: admin bekijkt ingevulde antwoorden, beoordeelt of er iets bruikbaars tussen zit, en "valideert" een evaluatie → dit betekent dat de listing effectief naar een specifieke, door de admin gekozen bestemming/organisatie is opgestuurd.
  - *Roadmap, niet v1*: na validatie automatisch een e-mail versturen naar de betrokken organisatie — pas te bouwen **na testfase**.
- GDPR: gebruiker + diens data verwijderen/anonimiseren (hergebruik `anonymize_user()`).

---

## 7. Gamification & retentie — status

| Mechanisme | Status |
|---|---|
| Directe feedback (punt bij invullen) | ✅ v1 |
| Confetti / swipe-animatie / geluid | ✅ v1 |
| Sociale vergelijking (leaderboard maandelijks + all-time) | ✅ v1 |
| Ex-aequo tonen i.p.v. verbergen | ✅ v1 |
| Zwaarder wegende punten voor kwaliteit (+3 vs +1) | ✅ v1 |
| Streaks | ⏸️ bewust **niet** in v1 — mogelijke latere toevoeging |
| Dagelijkse speellimiet/cap | ❌ niet voorzien — vrij spelen tot pool op is |
| Onboarding-hook (gegarandeerd eerste succes) | ❌ niet voorzien |
| Notificatie bij effectieve match/validatie | ⏸️ automatische mail is roadmap, na testfase |

*Let op:* met "spelen tot de listings op zijn" i.p.v. een dagelijkse cap, en zonder streak of onboarding-hook, leunt v1 vooral op de directe beloningslus (punten/confetti/leaderboard) voor retentie, minder op terugkeer-triggers. Dat is een bewuste, prima keuze voor een eerste versie — mocht retentie na lancering tegenvallen, zijn streaks en een maandelijkse "impact-mail" (X listings gematcht dankzij jouw evaluaties) de meest voor de hand liggende volgende stappen, gezien de bestaande ntfy/email-infrastructuur.

---

## 8. Slotbeslissingen

1. **Geen profanity/spamfilter** — moderatie gebeurt uitsluitend achteraf, manueel door admins (zie sectie 6).
2. **Zwakke authenticatie (geen verificatie, geen reset) is een bewust aanvaard risico**, geen verdere actie nodig.
3. **Data-retentie**: geen automatische cleanup. Verwijdering/anonimisering van spelaccounts gebeurt uitsluitend manueel door een admin (GDPR, sectie 3 & 6).
4. **Toegankelijkheid**: klikbare pijlen volstaan als toetsenbord/alternatief-input; geen extra ontwikkeling nodig.
5. **Max. aantal evaluaties per listing: 20.** Zodra een listing 20 evaluaties heeft, valt ze automatisch uit de random-selectiepool (naast de mogelijkheid voor een admin om ze vroeger manueel te verwijderen, sectie 6).

Hiermee is de PRD functioneel compleet voor v1. Resterende werk is technisch ontwerp: datamodel (spel-users, listings-referentie, evaluations, scores, monthly/all-time aggregatie), API-routes, en UI-componenten (swipe-kaart, pijlen, scorebord, admin-uitbreiding).


# Technisch ontwerp — Schat of Schroot? / Récup ou Rebut ?

**Bij:** PRD_Recup_of_Niet.md v0.4
**Stack:** FastAPI + MongoDB (los van hoofd-userdatabase) + React/CRA
**Doel van dit document:** overdraagbaar aan Claude Code voor implementatie binnen de bestaande `In-limbo`-repo.

---

## 1. Datamodel (nieuwe MongoDB-collecties)

Aparte collecties, niet gelinkt aan de bestaande `users`-collectie (cf. PRD §3).

### `game_users`
```
_id: ObjectId
username: string (uniek, case-insensitive index)
email: string (index, NIET uniek — meerdere usernames per email toegestaan)
createdAt: datetime
anonymized: bool (default false)   # GDPR
```

### `game_interactions`
Houdt bij welke listings een speler al gezien heeft (swipe-links of evaluatie), om herhaling binnen en tussen reeksen te vermijden.
```
_id: ObjectId
userId: ObjectId (ref game_users)
listingId: ObjectId (ref listings)
type: "reject" | "evaluate"        # links geswiped / evaluatie ingediend
createdAt: datetime
```
Unique compound index op `(userId, listingId)` — voorkomt dubbele interacties (cf. PRD: max 1x per listing per speler).

### `game_evaluations`
```
_id: ObjectId
listingId: ObjectId (ref listings)
userId: ObjectId (ref game_users)
answer1: string   # "Wat kan je ermee doen?"
answer2: string   # "Wie kan dit gebruiken?"
points: int (default 1)            # +3 bijkomend indien gekozen als beste
votes: int (default 0)             # aantal keer gekozen door andere spelers
hidden: bool (default false)       # admin-moderatie
createdAt: datetime
```

### Uitbreiding bestaande `listings`-collectie
```
gameEnabled: bool (default true)          # admin kan uitschakelen (elders gematcht / niet geschikt)
gameEvaluationCount: int (default 0)      # cap op 20, incrementeel bijgehouden
gameValidation: {
  validatedBy: ObjectId (admin user),
  validatedAt: datetime,
  destinationOrgId: ObjectId,
  evaluationId: ObjectId               # de gevalideerde evaluatie
} | null
```

### Leaderboards
Geen aparte opslag nodig — berekend via aggregatie op `game_evaluations` (group by `userId`, sum `points`), met optioneel een `createdAt`-filter voor de maandelijkse versie. Bij hoge belasting later evt. materialiseren in een `game_scores`-cache-collectie.

---

## 2. API-contract (FastAPI, prefix `/api/game`)

Los JWT-secret/scheme van het hoofdplatform (game-sessies zijn niet gelinkt aan platform-auth, cf. PRD §3).

| Methode | Route | Body / Params | Beschrijving |
|---|---|---|---|
| POST | `/api/game/register` | `{username, email}` | Nieuw account, of login bij match; `409` "Username al in gebruik" bij bestaande username + ander email. Retourneert game-token. |
| GET | `/api/game/series?lang=nl\|fr` | — | Random batch van max. 6 listings (gameEnabled=true, gameEvaluationCount<20, geen bestaande `game_interactions` voor deze user). Kan <6 teruggeven → front-end sluit reeks eerder af. |
| POST | `/api/game/swipe` | `{listingId, direction: "left"\|"right"}` | Bij `left`: registreert `reject`-interactie. Bij `right`: geen server-call nodig (front-end gaat door naar evaluatieformulier); interactie wordt pas bij `evaluate` weggeschreven. |
| POST | `/api/game/evaluate` | `{listingId, answer1, answer2}` | 400 bij lege velden. Slaat evaluatie op, +1 punt, verhoogt `gameEvaluationCount`. Retourneert `{isFirstEvaluator: bool, topEvaluations: [...]}` (leeg indien eerste). |
| POST | `/api/game/choose-best` | `{listingId, evaluationId}` | +3 punten aan auteur (tenzij eigen evaluatie). Definitief, geen undo-route. |
| GET | `/api/game/leaderboard?scope=monthly\|alltime` | — | Top 10 `{username, points}`. |
| GET | `/api/game/rules?lang=nl\|fr` | — | Spelregels-tekst voor het info-icoon. |

### Admin (uitbreiding bestaande admin-router, achter bestaande admin-auth)

| Methode | Route | Beschrijving |
|---|---|---|
| GET | `/api/admin/game/users` | Lijst met username + email + statistieken per speler. |
| GET | `/api/admin/game/listings-stats` | Statistieken per listing (aantal evaluaties, top-evaluatie). |
| GET | `/api/admin/game/evaluations/top` | Top evaluaties over alle listings. |
| PATCH | `/api/admin/game/evaluations/{id}/moderate` | `{hidden: bool}` |
| PATCH | `/api/admin/game/listings/{id}/exclude` | `{gameEnabled: bool}` |
| POST | `/api/admin/game/evaluations/{id}/validate` | `{destinationOrgId}` → zet `gameValidation` op de listing. *(Automatische mail: roadmap, niet v1.)* |
| DELETE | `/api/admin/game/users/{id}` | Anonimiseert game-account (hergebruik patroon van `anonymize_user()`). |

---

## 3. Front-end componenten (React/CRA)

Consistent met bestaande conventie: routepagina's in `pages/`, admin-tabcontent in `pages/admin/`.

```
pages/
  Game.jsx                    # route wrapper /spel/nl, /spel/fr — leest lang uit URL
  admin/
    AdminGame.jsx              # nieuw admin-tabblad

components/game/
  GameRegister.jsx             # username + email form
  GamePlay.jsx                 # state machine: reeks-voortgang, huidige listing
  SwipeCard.jsx                # foto + klik-en-sleep + swipe-animatie
  SwipeArrows.jsx              # linker (vuilbak) / rechter (lamp) pijl, klikbaar
  EvaluationForm.jsx           # vraag 1 + vraag 2, enter-to-submit, lege-veld-validatie
  ChooseBestPanel.jsx          # top-evaluaties (incl. ex aequo) + eigen evaluatie, keuze = definitief
  Confetti.jsx                 # afronding-animatie
  SoundToggle.jsx              # naast info-icoon, default aan
  InfoModal.jsx                # spelregels, halfdoorzichtig icoon linksboven
  Scoreboard.jsx                # top 10, monthly + all-time tabs, "opnieuw spelen"-knop
```

**State-logica `GamePlay.jsx` (kern van de reeks):**
1. `GET /series` bij start → lijst van max. 6 listings.
2. Per listing: swipe/klik → links = `POST /swipe` (reject) → volgende; rechts = toon `EvaluationForm`.
3. Na `POST /evaluate`: als `isFirstEvaluator` → volgende listing; anders → `ChooseBestPanel` → `POST /choose-best` → volgende listing.
4. Lijst leeg of `<6` bij start → `Scoreboard`.
5. "Opnieuw spelen" → nieuwe `GET /series`-call; knop actief zolang er nog niet-geïnteracteerde listings bestaan (server bepaalt dit, front-end toont gewoon leeg-resultaat als disabled-state).

---

## 4. Aandachtspunten voor Claude Code bij implementatie

- Game-auth-token apart houden van het bestaande platform-JWT (andere secret/scope) — cf. PRD §3, losstaand account-systeem.
- `gameEvaluationCount` en de unique index op `game_interactions` zijn de twee plekken waar racecondities kunnen optreden bij gelijktijdige requests — atomic `$inc` / upsert met unique index gebruiken, niet read-then-write.
- Random selectie voor `/series`: MongoDB `$sample` aggregatie-stage, met de uitsluitingsfilters vooraf.
- Herbruik bestaand i18n-patroon (`nl.json`/`fr.json`) voor spelteksten, ook al wordt de taal via de route bepaald i.p.v. `preferredLanguage`.
- Herbruik bestaande Cloudinary-URL's van listings voor de foto's — geen aparte upload-flow nodig.

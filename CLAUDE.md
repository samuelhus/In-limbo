# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

In Limbo is a Brussels platform that connects organisations with surplus materials ("aanbieders" offering
"aanbiedingen"/listings) to organisations or individuals who need them ("aanvragers" submitting "aanvragen"/
applications, or posting "zoekertjes"/search requests when nothing suitable exists yet). Backend is FastAPI +
MongoDB (`backend/`), frontend is Create React App via craco (`frontend/`). All code comments, commit messages,
and user-facing copy are in Dutch (with French as a secondary UI language via i18next) — match that convention
in new code.

## Commands

### Backend (`backend/`)
- Install deps: `pip install -r requirements.txt`
- Run dev server: `uvicorn server:app --reload --port 8001` (from `backend/`; the local dev backend conventionally
  runs on port 8001 — see the `test_conversations.py` `BASE_URL` fallback). Requires a `.env` in `backend/` with at
  least `MONGO_URL`, `DB_NAME`, `JWT_SECRET`; other keys (Cloudinary, Resend, MailerLite, ntfy, Sentry) are read
  via `os.environ.get(...)` and degrade gracefully (no-op/skip) when unset.
- Run all tests: `pytest` (from `backend/`)
- Run a single test file/test: `pytest tests/test_conversations.py::test_name`
- **Tests are integration tests, not unit tests**: they use `requests` to hit a *running* backend (`BASE_URL`, env
  `REACT_APP_BACKEND_URL` or default `http://localhost:8001`) and connect directly to MongoDB (`MONGO_URL`/`DB_NAME`)
  to set up/assert on fields not exposed via the API. Start the backend (and MongoDB) before running `pytest`.
  Tests log in as seeded fixture accounts (see `backend/seed.py`, e.g. the `lotte@atelier-brussel.example` /
  `samir@vagebond.example` pair used across several test files) rather than mocking auth.

### Frontend (`frontend/`)
- Install deps: `yarn install`
- Run dev server: `yarn start` (craco start, port 3000)
- Build: `yarn build`
- Tests: `yarn test` (craco test / CRA Jest runner) — no test files exist yet in `src/`.
- Needs `REACT_APP_BACKEND_URL` (e.g. `http://localhost:8001`) in `frontend/.env` to reach the backend.

## Backend architecture

- `server.py` is the bootstrap: Sentry init, Cloudinary config, CORS, mounts every router in `routes/` under
  `/api`, creates all Mongo indexes and registers APScheduler jobs on the `startup` event. When adding a new
  scheduled job or index, add it here next to the existing ones rather than creating a second scheduler/init path.
- `deps.py` holds the shared Motor `db`/`client`, the `limiter` (slowapi) instance, `log`, and cross-cutting helpers
  used by many routes: `strip_mongo` (strips `_id`/internal fields before returning a document), the
  `slugify`/`generate_unique_*_slug` family (orgs/listings/search requests all follow the same slug-collision
  pattern: append `-2`, `-3`, ...), and `anonymize_user` (GDPR soft-delete: scrubs PII in place but keeps the
  document/id alive so historical listings/applications referencing that user still resolve).
- `models.py` is the single source of truth for Pydantic schemas and domain `Literal` enums (`UserRole`,
  `UserStatus`, `OrgStatus`, `ListingStatus`, `ApplicationStatus`, etc.) — check here first for the shape of any
  document before writing a new route.
- `auth.py`: JWT stored in an httponly cookie (`il_token`) or `Authorization: Bearer`, decoded per-request. Route
  dependencies compose in a fixed hierarchy: `get_current_user` (401 if unauthenticated) →
  `get_validated_user` (403 unless `status == "validated"`) / `get_donateur_or_validated_user` (donateurs skip the
  validation gate) / `get_admin_user` (403 unless `role == "admin"`). Use whichever matches the route's actual
  access rule instead of hand-rolling checks.
- `notifications.py`: `create_notification` is the single entry point for in-app notifications; `send_email` /
  `render_email` / `maybe_send_email` wrap Resend and respect each user's `EmailPreferences`; `notify_ntfy` pushes
  admin alerts via ntfy. Follow the existing call sites (e.g. new-application, new-message) as the template when
  wiring notifications for a new event type.
- `tasks.py`: standalone async functions for scheduled/background work (archiving expired listings, deactivating
  inactive orgs, photo reminders, the message-email digest). These are plain functions taking `db`, invoked both
  from an APScheduler job in `server.py` and directly from tests — keep that signature style for new jobs so they
  stay independently testable.
- `routes/*.py`: one router module per domain (`auth`, `organisations`, `users`, `listings`, `applications`,
  `search_requests`, `conversations`, `news`, `checkout`, `checkin`, `admin`, `contact`, `impact`, `og`, `tags`,
  `donateur`, `notifications`). Cross-domain logic (e.g. a message notifying about an application) reaches into
  another domain's helpers directly rather than through an event bus — there's no message queue in this system.

### Domain model
Core collections and how they relate: `users` (role: `user`/`admin`/`donateur`; status: `pending`/`validated`/
`rejected`, gating most of the app) belong to an `organisations` (status adds `active`/`inactive` for
post-validation lifecycle). An org's `listings` ("aanbiedingen") are the materials on offer; other users submit
`applications` ("aanvragen") against a listing, and the offerer selects one applicant. A `search_requests`
("zoekertjes") lets an org advertise what it's looking for even without a matching listing. Once an application is
selected, a 1:1 `conversations` (unique on `applicationId`) + `messages` pair lets the two parties chat, with
attachment caps, per-user block/hide, and an unread-digest email job (see `PRD_direct_messaging.md` for the full
spec — this feature was built in the numbered phases listed in `claude_code_prompts.md`). `checkin`/`checkout`
document physical pickup/drop-off, feeding the admin impact/statistics views. `news` posts split into
`nieuws`/`inspiratie` categories per `PostType`.

### Notificaties vs. Meldingen vs. Berichten
Three Dutch terms that sound interchangeable but name three distinct systems — keep them apart, both in code and
in any new UI copy, rather than treating one as a synonym for another:
- **Notificaties**: in-app notifications about a user's own actions/events on the platform (an application was
  selected, someone applied to your listing, ...) — deliberately *not* new-message events, see the `Berichten` note
  below. Entry point `notifications.py::create_notification`, `notifications` collection,
  `routes/notifications.py`; surfaced via `pages/Notificaties.jsx` and the unread badge in `Header.jsx`. Always
  addressed to a specific `userId`.
- **Meldingen**: events *admins* need to be aware of, not the regular user-facing notification feed above. Two
  concrete mechanisms today: `notify_ntfy` (push to admins' ntfy app for events like a new registration or a new
  listing, see call sites in `notifications.py`/`routes/listings.py`), and the "Meldingen" tab in
  `pages/AdminPanel.jsx` (currently a placeholder for user-submitted reports/flags — not built yet). When adding an
  admin-alerting feature, this is the vocabulary to reach for, not "notificaties".
- **Berichten**: the 1:1 direct-messaging system tied to a selected application (`routes/conversations.py`,
  `conversations`/`messages` collections, `pages/Berichten.jsx` + `pages/GesprekDetail.jsx`, see also
  `PRD_direct_messaging.md`). Despite the name suggesting "between users", admins and donateurs use this exact
  same channel too whenever they happen to be the offerer or requester on a given application — there is no
  separate messaging system for them. A new message deliberately does *not* also raise a Notificatie (removed, see
  "Fase 10" in the module docstring of `routes/conversations.py`) — the unread-conversations badge already covers
  it, so both together was a duplicate alert.

## Frontend architecture

- CRA bootstrapped via **craco** (not plain `react-scripts`) — webpack/eslint/jest tweaks live in
  `craco.config.js`, not in ejected config. The `@/*` → `src/*` import alias is defined in three places that must
  stay in sync: `craco.config.js` (webpack alias, used by the actual build), `jsconfig.json` (editor path
  resolution — since TypeScript 7, `paths` values must be relative, e.g. `"./src/*"`, `baseUrl` is no longer
  supported), and `components.json` (shadcn/ui's own alias config for `components`/`utils`/`ui`/`lib`/`hooks`).
- `App.js` composes `AuthProvider` → `MessagesProvider` around the router; both contexts poll the backend
  (unread notifications / unread conversations badge). Routes are gated with `<ProtectedRoute>`
  (`requireValidated`, `requireAdmin`, `allowDonateur` props) which redirects based on `user.status`/`user.role`
  from `AuthContext` — reuse this instead of ad hoc auth checks in page components.
- `pages/` holds one component per route (mostly matching Dutch route paths in `App.js`, e.g. `Berichten.jsx` ↔
  `/berichten`); `components/` holds shared UI, and `components/ui/` is shadcn/ui-generated primitives (button,
  dialog, select, etc.) — treat these as generated/vendored and prefer composing them over editing their internals.
- `lib/api.js` exports a single configured `axios` instance (`withCredentials: true`, `baseURL` from
  `REACT_APP_BACKEND_URL`) and `formatApiError` for turning FastAPI error responses (string, list of pydantic
  errors, or `{msg}`) into a displayable message — use both rather than creating new axios instances or re-parsing
  `err.response.data.detail` inline.
- i18n via `i18next` (`i18n.js`), resources loaded from `src/locales/nl.json` and `src/locales/fr.json`
  (`fallbackLng: 'nl'`). Any new user-facing string needs an entry in **both** locale files — Dutch is the
  authoritative source, French is the translation.

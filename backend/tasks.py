"""Background-ish maintenance tasks: archive expired listings + mark inactive orgs
+ herinneringsmails om 3 maanden na een overdracht/checkout een resultaatfoto te vragen
+ e-maildigest voor ongelezen berichten (PRD_direct_messaging.md §6.6)."""
from __future__ import annotations
import html
import uuid
from datetime import datetime, timezone, timedelta

from notifications import (
    create_notification, purge_old_notifications, render_email, maybe_send_email,
    send_email, pick_lang, FRONTEND_URL,
)

MONTHS_NL = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
]

MONTHS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _month_bucket_phrase(dt: datetime) -> str:
    """'begin/midden/eind <maand>' op basis van de dag van de maand."""
    bucket = "begin" if dt.day <= 10 else ("midden" if dt.day <= 20 else "eind")
    return f"{bucket} {MONTHS_NL[dt.month - 1]}"


def _month_bucket_phrase_fr(dt: datetime) -> str:
    """'début/mi/fin <mois>' — Franse variant."""
    bucket = "début" if dt.day <= 10 else ("mi-" if dt.day <= 20 else "fin")
    sep = "" if bucket == "mi-" else " "
    return f"{bucket}{sep}{MONTHS_FR[dt.month - 1]}"

async def archive_expired_listings(db) -> int:
    """Set status='gearchiveerd' on listings where deadline < today and not recurrent."""
    today_iso = datetime.now(timezone.utc).date().isoformat()
    now = datetime.now(timezone.utc).isoformat()

    # Snapshot listings that will be archived so we can notify their owners
    to_archive = await db.listings.find(
        {
            "isRecurrent": False,
            "deadline": {"$ne": None, "$lt": today_iso},
            "status": "beschikbaar",
        },
        {"_id": 0, "id": 1, "userId": 1, "title": 1},
    ).to_list(500)

    result = await db.listings.update_many(
        {
            "isRecurrent": False,
            "deadline": {"$ne": None, "$lt": today_iso},
            "status": "beschikbaar",
        },
        {"$set": {"status": "gearchiveerd", "updatedAt": now}},
    )

    for lst in to_archive:
        msg = f'De deadline van je aanbieding "{lst.get("title","")}" is vervallen.'
        await create_notification(db, lst["userId"], "deadline_expired", msg, lst["id"], lst.get("title"))

    # Purge old notifications opportunistically
    await purge_old_notifications(db, days=30)

    return result.modified_count


async def mark_inactive_orgs(db) -> int:
    """Mark organisations inactive if NO member logged in for 24+ months.

    Rules:
    - Only organisations with status 'active' are candidates.
    - A member counts as active if dateLastLogin >= threshold (24 months ago),
      OR if dateLastLogin is missing/None but createdAt >= threshold.
    - Both 'validated' and 'pending' users are counted — a pending user recently
      registered is proof of recent activity and must prevent premature inactivation.
    - We never touch orgs that are already 'pending' or 'inactive' (unless they
      become active again, in which case we restore them to 'active').
    """
    threshold = (datetime.now(timezone.utc) - timedelta(days=730)).isoformat()
    now_str = datetime.now(timezone.utc).isoformat()

    # Collect orgs that have at least one recently active member.
    # A member is "active" if dateLastLogin >= threshold,
    # OR if dateLastLogin is missing but createdAt >= threshold (new member).
    active_orgs: set = set()
    async for user in db.users.find(
        {
            "status": "validated",
            "organisationId": {"$exists": True, "$ne": None},
            "$or": [
                {"dateLastLogin": {"$gte": threshold}},
                {"dateLastLogin": {"$exists": False}, "createdAt": {"$gte": threshold}},
                {"dateLastLogin": None, "createdAt": {"$gte": threshold}},
            ],
        },
        {"organisationId": 1, "_id": 0},
    ):
        org_id = user.get("organisationId")
        if org_id:
            active_orgs.add(org_id)

    # Restore previously inactive orgs that now have active members back to 'active'
    # (do NOT touch orgs in 'pending' status)
    if active_orgs:
        await db.organisations.update_many(
            {"id": {"$in": list(active_orgs)}, "status": "inactive"},
            {"$set": {"status": "active", "updatedAt": now_str}},
        )

    # Mark as inactive only orgs that are currently 'active'
    # and have NO active members — never touch 'pending' orgs
    result = await db.organisations.update_many(
        {
            "id": {"$nin": list(active_orgs)},
            "status": {"$in": ["active"]},
        },
        {"$set": {"status": "inactive", "updatedAt": now_str}},
    )
    return result.modified_count


async def send_photo_reminders(db) -> int:
    """Herinner ontvangers ~3 maanden (90 dagen) na een aanbieding-overdracht of
    checkout om een foto van het resultaat te sturen (zie photoReceived-vlag in
    het admin-transactieoverzicht).

    Regels:
    - Enkel platform_transfers en checkouts (geen checkins — die hebben geen ontvanger).
    - Enkel als photoReceived nog niet True is.
    - Elke transactie wordt hoogstens 1x herinnerd (bijgehouden in photo_reminders).
    - Max 1 herinneringsmail per organisatie per kalendermaand.
    - Checkouts van dezelfde organisatie die binnen 30 dagen van een reeds
      herinnerde (of net verstuurde) checkout vallen, worden PERMANENT
      onderdrukt — ook in latere maanden komt daar nooit nog een aparte
      herinnering voor. Ze horen bij hetzelfde "bezoek-cluster".
    - Bij een platform-overdracht kennen we de ontvanger-gebruiker rechtstreeks
      (receiverUserId). Bij checkout is er geen gebruiker gekend (publiek endpoint) —
      we mailen dan de laatst actieve gebruiker (hoogste dateLastLogin) van de
      ontvangende organisatie, of de expliciet gekozen gebruiker (pickedUserId)
      wanneer die op de checkout staat.
    - Studenten-checkouts (checkout.studentEmail gezet — enkel mogelijk bij
      organisaties met studentCheckout aan, zie routes/checkout.py) vallen
      BUITEN de organisatie-brede maandlimiet/clustering hierboven: elke
      student krijgt zijn eigen, onafhankelijke maandlimiet + 30-dagen-cluster
      (bijgehouden per (organisatie, studentEmail) i.p.v. per organisatie),
      en de herinnering gaat rechtstreeks naar het opgegeven e-mailadres — de
      gebruiker van de organisatie (leerkracht) krijgt daar geen mail van.
    """
    now = datetime.now(timezone.utc)
    cutoff_iso = (now - timedelta(days=90)).isoformat()
    month_key = now.strftime("%Y-%m")
    cluster_window = timedelta(days=30)

    reminded_ids = {
        (r["txType"], r["txId"])
        async for r in db.photo_reminders.find({}, {"_id": 0, "txType": 1, "txId": 1})
    }
    # Org-brede maandlimiet/clustering (platform-overdrachten + gewone
    # checkouts) — 'studentEmail: None' matcht zowel expliciet None als
    # (bij oudere records) een ontbrekend veld, dus legacy-records tellen
    # hier gewoon mee zoals voorheen.
    orgs_reminded_this_month = {
        r["organisationId"]
        async for r in db.photo_reminders.find(
            {"monthKey": month_key, "studentEmail": None}, {"_id": 0, "organisationId": 1},
        )
    }
    handled_checkout_times: dict = {}
    async for r in db.photo_reminders.find(
        {"txType": "checkout", "studentEmail": None}, {"_id": 0, "organisationId": 1, "createdAt": 1},
    ):
        handled_checkout_times.setdefault(r["organisationId"], []).append(
            datetime.fromisoformat(r["createdAt"])
        )

    # Zelfde twee mechanismen, maar losstaand per (organisatie, student).
    students_reminded_this_month = {
        (r["organisationId"], r["studentEmail"])
        async for r in db.photo_reminders.find(
            {"monthKey": month_key, "studentEmail": {"$ne": None}},
            {"_id": 0, "organisationId": 1, "studentEmail": 1},
        )
    }
    handled_student_checkout_times: dict = {}
    async for r in db.photo_reminders.find(
        {"txType": "checkout", "studentEmail": {"$ne": None}},
        {"_id": 0, "organisationId": 1, "studentEmail": 1, "createdAt": 1},
    ):
        key = (r["organisationId"], r["studentEmail"])
        handled_student_checkout_times.setdefault(key, []).append(
            datetime.fromisoformat(r["createdAt"])
        )

    # Kandidaten-key is org_id voor platform-overdrachten en gewone checkouts
    # (die delen dus dezelfde maand-'slot', zoals voorheen), en (org_id,
    # studentEmail) voor student-checkouts — dat is hun eigen, onafhankelijke
    # slot. We houden per key enkel de OUDSTE nog niet-herinnerde transactie
    # bij — dat is degene die deze maand-run herinnerd wordt.
    candidates: dict = {}

    async for tr in db.platform_transfers.find(
        {"photoReceived": {"$ne": True}, "createdAt": {"$lte": cutoff_iso}}
    ):
        if ("platform", tr["id"]) in reminded_ids:
            continue
        org_id = tr.get("receiverOrganisationId")
        if not org_id or org_id in orgs_reminded_this_month:
            continue
        existing = candidates.get(org_id)
        if not existing or tr["createdAt"] < existing["createdAt"]:
            candidates[org_id] = {
                "txType": "platform",
                "txId": tr["id"],
                "organisationId": org_id,
                "createdAt": tr["createdAt"],
                "listingId": tr.get("listingId"),
                "listingTitle": tr.get("listingTitle"),
                "receiverUserId": tr.get("receiverUserId"),
            }

    async for c in db.checkouts.find(
        {"photoReceived": {"$ne": True}, "createdAt": {"$lte": cutoff_iso}}
    ).sort("createdAt", 1):
        if ("checkout", c["id"]) in reminded_ids:
            continue
        org_id = c.get("organisationId")
        if not org_id:
            continue
        student_email = c.get("studentEmail")
        c_dt = datetime.fromisoformat(c["createdAt"])

        if student_email:
            cand_key = (org_id, student_email)
            prior_times = handled_student_checkout_times.get(cand_key, [])
            if any(abs(c_dt - t) <= cluster_window for t in prior_times):
                await db.photo_reminders.insert_one({
                    "id": str(uuid.uuid4()),
                    "organisationId": org_id,
                    "txType": "checkout",
                    "txId": c["id"],
                    "monthKey": month_key,
                    "sentAt": None,
                    "suppressed": True,
                    "studentEmail": student_email,
                })
                reminded_ids.add(("checkout", c["id"]))
                continue
            if cand_key in students_reminded_this_month:
                continue
        else:
            cand_key = org_id
            # Valt deze checkout binnen 30 dagen van een reeds herinnerde/onderdrukte
            # checkout van dezelfde org? Dan permanent onderdrukken, ongeacht maand-cap.
            prior_times = handled_checkout_times.get(org_id, [])
            if any(abs(c_dt - t) <= cluster_window for t in prior_times):
                await db.photo_reminders.insert_one({
                    "id": str(uuid.uuid4()),
                    "organisationId": org_id,
                    "txType": "checkout",
                    "txId": c["id"],
                    "monthKey": month_key,
                    "sentAt": None,
                    "suppressed": True,
                    "studentEmail": None,
                })
                reminded_ids.add(("checkout", c["id"]))
                continue
            if org_id in orgs_reminded_this_month:
                continue

        existing = candidates.get(cand_key)
        if not existing or c["createdAt"] < existing["createdAt"]:
            candidates[cand_key] = {
                "txType": "checkout",
                "txId": c["id"],
                "organisationId": org_id,
                "createdAt": c["createdAt"],
                "studentEmail": student_email,
                "pickedUserId": c.get("pickedUserId"),
            }

    sent = 0
    for cand in candidates.values():
        org_id = cand["organisationId"]
        recipient_email = None
        recipient_lang = "nl"
        recipient_user_id = None

        if cand.get("studentEmail"):
            # Rechtstreeks naar de student — de gebruiker van de organisatie
            # (leerkracht) krijgt hier bewust geen mail van.
            recipient_email = cand["studentEmail"]
            recipient_user_id = f"student:{cand['studentEmail']}"
        else:
            recipient = None
            if cand.get("receiverUserId"):
                recipient = await db.users.find_one({"id": cand["receiverUserId"]})
            elif cand.get("pickedUserId"):
                # Expliciet gekozen bij checkout ('bestaande gebruiker') — betrouwbaarder
                # dan de 'laatst actieve gebruiker'-gok hieronder.
                recipient = await db.users.find_one({"id": cand["pickedUserId"]})
            if not recipient:
                # Checkout (of oude transfer zonder receiverUserId): laatst actieve gebruiker van de org.
                recipient = await db.users.find_one(
                    {"organisationId": org_id, "status": "validated"}, sort=[("dateLastLogin", -1)],
                )
            if not recipient:
                recipient = await db.users.find_one({"organisationId": org_id}, sort=[("createdAt", -1)])
            if not recipient or not recipient.get("email"):
                continue
            recipient_email = recipient["email"]
            recipient_lang = recipient.get("preferredLanguage") or "nl"
            recipient_user_id = recipient["id"]

        created_dt = datetime.fromisoformat(cand["createdAt"])
        lang = recipient_lang
        cta_text, cta_url = None, None
        if lang == "fr":
            email_title = "Partagez une photo du résultat"
            subject = "Rappel : partagez une photo du résultat"
            if cand["txType"] == "platform":
                body_lines = [
                    f'Il y a environ 3 mois, vous avez reçu via In Limbo « {cand.get("listingTitle") or "une annonce"} ».',
                    "Pourriez-vous nous envoyer une photo du résultat ? Cela nous aide énormément à rendre visible l'impact du réemploi.",
                ]
                if cand.get("listingId"):
                    cta_text, cta_url = "Voir l'annonce →", f"{FRONTEND_URL}/aanbieding/{cand['listingId']}"
            else:
                phrase = _month_bucket_phrase_fr(created_dt)
                body_lines = [
                    f"Vous êtes passé {phrase} à notre entrepôt pour récupérer du matériel.",
                    "Pourriez-vous nous envoyer une photo du résultat ? Cela nous aide énormément à rendre visible l'impact du réemploi.",
                ]
        else:
            email_title = "Deel een foto van het resultaat"
            subject = "Herinnering: deel een foto van het resultaat"
            if cand["txType"] == "platform":
                body_lines = [
                    f'Zo\'n 3 maanden geleden ontving je via In Limbo "{cand.get("listingTitle") or "een aanbieding"}".',
                    "Zou je een foto kunnen doorsturen van het resultaat? Dat helpt ons om de impact van hergebruik zichtbaar te maken.",
                ]
                if cand.get("listingId"):
                    cta_text, cta_url = "Bekijk aanbieding →", f"{FRONTEND_URL}/aanbieding/{cand['listingId']}"
            else:
                phrase = _month_bucket_phrase(created_dt)
                body_lines = [
                    f"U kwam {phrase} langs in ons magazijn om materiaal op te halen.",
                    "Zou je een foto kunnen doorsturen van het resultaat? Dat helpt ons om de impact van hergebruik zichtbaar te maken.",
                ]

        html = render_email(email_title, body_lines, cta_text=cta_text, cta_url=cta_url)
        await maybe_send_email(
            db, recipient_user_id, "photo_reminder", recipient_email,
            subject, html,
        )
        await db.photo_reminders.insert_one({
            "id": str(uuid.uuid4()),
            "organisationId": org_id,
            "txType": cand["txType"],
            "txId": cand["txId"],
            "monthKey": month_key,
            "sentAt": now.isoformat(),
            "suppressed": False,
            "studentEmail": cand.get("studentEmail"),
        })
        sent += 1

    return sent


MESSAGE_EMAIL_REMINDER_DELAY = timedelta(minutes=30)  # PRD §6.6


async def _display_name(db, user: dict) -> str:
    """Organisatienaam > username > voor-/achternaam — zelfde patroon als
    bv. applicant_name in routes/applications.py en sender_name in
    routes/conversations.py::send_message."""
    org_name = None
    if user.get("organisationId"):
        org = await db.organisations.find_one({"id": user["organisationId"]}, {"_id": 0, "name": 1})
        org_name = org["name"] if org else None
    return org_name or user.get("username") or f'{user.get("firstName","")} {user.get("lastName","")}'.strip()


async def send_message_email_reminders(db, *, delay: timedelta = MESSAGE_EMAIL_REMINDER_DELAY) -> int:
    """E-maildigest voor ongelezen berichten (PRD §6.6, direct messaging fase 5).

    Draait elke ~5 min (zie server.py). Voor elke partij (offerer/requester)
    van elk gesprek met een lopende ongelezen-periode ({prefix}UnreadSince):

    1. Skip als unreadSince nog niet ouder is dan `delay` (default 30 min).
    2. Skip als er al een mail verstuurd is ná het begin van déze periode
       (emailSentAt >= unreadSince) — "max 1 mail per ongelezen-periode",
       geen herhaalde herinneringen.
    3. "Is het gesprek intussen gelezen?" wordt niet apart gecheckt: lezen
       (routes/conversations.py::mark_conversation_read) zet unreadSince
       meteen terug op None, dus een gelezen periode faalt vanzelf al de
       "unreadSince is gezet"-voorwaarde hierboven — geen aparte query nodig.
    4. Bundel alle berichten van de andere partij sinds unreadSince in één
       mail via de bestaande send_email-helper, en zet emailSentAt.

    `delay` is enkel overrideable voor tests (PRD-voorstel: test met een
    korte vertraging, bv. 1 minuut, i.p.v. de 30 minuten die de effectief
    geregistreerde job in server.py gebruikt).
    """
    now = datetime.now(timezone.utc)
    cutoff_iso = (now - delay).isoformat()

    candidates = await db.conversations.find(
        {"$or": [{"offererUnreadSince": {"$ne": None}}, {"requesterUnreadSince": {"$ne": None}}]}
    ).to_list(500)

    sent = 0
    for conv in candidates:
        listing = await db.listings.find_one({"id": conv["listingId"]}, {"_id": 0, "userId": 1, "title": 1})
        if not listing:
            continue
        offerer_user_id = listing["userId"]
        requester_user_id = conv["requesterUserId"]

        for prefix, recipient_user_id, other_party_id in (
            ("offerer", offerer_user_id, requester_user_id),
            ("requester", requester_user_id, offerer_user_id),
        ):
            unread_since = conv.get(f"{prefix}UnreadSince")
            if not unread_since or unread_since > cutoff_iso:
                continue
            email_sent_at = conv.get(f"{prefix}EmailSentAt")
            if email_sent_at and email_sent_at >= unread_since:
                continue  # al 1 mail verstuurd voor deze ongelezen-periode

            messages = await db.messages.find(
                {"conversationId": conv["id"], "senderId": {"$ne": recipient_user_id}, "createdAt": {"$gte": unread_since}}
            ).sort("createdAt", 1).to_list(200)
            if not messages:
                # Zou niet mogen voorkomen (unreadSince wordt enkel gezet bij
                # een nieuw bericht) — defensief overslaan i.p.v. een lege
                # mail sturen; emailSentAt laten we dan ook ongemoeid, zodat
                # een latere run alsnog kan bundelen mocht dit toch gebeuren.
                continue

            recipient = await db.users.find_one({"id": recipient_user_id})
            if not recipient or not recipient.get("email"):
                continue
            other_party = await db.users.find_one({"id": other_party_id}) or {}
            other_name = await _display_name(db, other_party)
            listing_title = listing.get("title") or ""
            cta_url = f"{FRONTEND_URL}/aanbieding/{conv['listingId']}"

            # Berichttekst is vrije, ongemodereerde tekst van een andere
            # gebruiker (zie PRD §12) — html.escape() vóór opname in de
            # e-mail-HTML, newlines als <br/> (zelfde stijl als notify_
            # admins_contact_message hierboven, maar dan wél ge-escaped).
            safe_texts = [html.escape(m["text"]).replace("\n", "<br/>") for m in messages]

            lang = pick_lang(recipient)
            if lang == "fr":
                subject = f"Nouveaux messages de {other_name}"
                title = "Vous avez de nouveaux messages"
                n = len(messages)
                intro = (
                    f'{other_name} vous a envoyé {n} message{"s" if n > 1 else ""} '
                    f'à propos de « {listing_title} ».'
                )
                cta_text = "Voir l'annonce →"
            else:
                subject = f"Nieuwe berichten van {other_name}"
                title = "Je hebt nieuwe berichten"
                n = len(messages)
                intro = (
                    f'{other_name} stuurde je {n} bericht{"en" if n > 1 else ""} '
                    f'over "{listing_title}".'
                )
                cta_text = "Bekijk aanbieding →"

            body_lines = [intro] + [f"<em>{t}</em>" for t in safe_texts]
            html_content = render_email(title, body_lines, cta_text=cta_text, cta_url=cta_url)
            await send_email(recipient["email"], subject, html_content)

            await db.conversations.update_one(
                {"id": conv["id"]}, {"$set": {f"{prefix}EmailSentAt": now.isoformat()}},
            )
            sent += 1

    return sent

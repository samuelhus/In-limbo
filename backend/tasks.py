"""Background-ish maintenance tasks: archive expired listings + mark inactive orgs
+ herinneringsmails om 3 maanden na een overdracht/checkout een resultaatfoto te vragen."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone, timedelta

from notifications import create_notification, purge_old_notifications, render_email, maybe_send_email, FRONTEND_URL

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
      ontvangende organisatie.
    """
    now = datetime.now(timezone.utc)
    cutoff_iso = (now - timedelta(days=90)).isoformat()
    month_key = now.strftime("%Y-%m")
    cluster_window = timedelta(days=30)

    reminded_ids = {
        (r["txType"], r["txId"])
        async for r in db.photo_reminders.find({}, {"_id": 0, "txType": 1, "txId": 1})
    }
    orgs_reminded_this_month = {
        r["organisationId"]
        async for r in db.photo_reminders.find({"monthKey": month_key}, {"_id": 0, "organisationId": 1})
    }
    # Reeds behandelde (herinnerd of onderdrukt) checkout-tijdstippen per org —
    # gebruikt om te bepalen of een checkout binnen hetzelfde 30-dagen-cluster valt.
    handled_checkout_times: dict = {}
    async for r in db.photo_reminders.find({"txType": "checkout"}, {"_id": 0, "organisationId": 1, "createdAt": 1}):
        handled_checkout_times.setdefault(r["organisationId"], []).append(
            datetime.fromisoformat(r["createdAt"])
        )

    # Per organisatie houden we enkel de OUDSTE nog niet-herinnerde, nog niet
    # foto-ontvangen transactie bij — dat is degene die deze maand-run herinnerd wordt.
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
        c_dt = datetime.fromisoformat(c["createdAt"])
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
            })
            reminded_ids.add(("checkout", c["id"]))
            continue
        if org_id in orgs_reminded_this_month:
            continue
        existing = candidates.get(org_id)
        if not existing or c["createdAt"] < existing["createdAt"]:
            candidates[org_id] = {
                "txType": "checkout",
                "txId": c["id"],
                "organisationId": org_id,
                "createdAt": c["createdAt"],
            }

    sent = 0
    for org_id, cand in candidates.items():
        recipient = None
        if cand.get("receiverUserId"):
            recipient = await db.users.find_one({"id": cand["receiverUserId"]})
        if not recipient:
            # Checkout (of oude transfer zonder receiverUserId): laatst actieve gebruiker van de org.
            recipient = await db.users.find_one(
                {"organisationId": org_id, "status": "validated"}, sort=[("dateLastLogin", -1)],
            )
        if not recipient:
            recipient = await db.users.find_one({"organisationId": org_id}, sort=[("createdAt", -1)])
        if not recipient or not recipient.get("email"):
            continue

        created_dt = datetime.fromisoformat(cand["createdAt"])
        lang = recipient.get("preferredLanguage") or "nl"
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
            db, recipient["id"], "photo_reminder", recipient.get("email"),
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
        })
        sent += 1

    return sent

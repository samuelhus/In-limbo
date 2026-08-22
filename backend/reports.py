"""Meldingen (admin-overzicht van platformgebeurtenissen), zie prd/PRD_meldingen_admin.md.

Los van notifications.py::create_notification — een Melding is gericht aan de
admin-groep als geheel (gedeelde open/afgehandeld-status), niet aan één
specifieke gebruiker (PRD §3). create_report is het enige insertpunt voor
db.reports, hergebruikt door alle 6 triggers (§5) zodat elke call site
dezelfde vorm/insert-logica deelt in plaats van los MongoDB-verkeer per
call site (PRD §8). Faalt zacht, net als create_notification — een Melding
mag nooit de onderliggende gebruikersflow (aanbieding melden, zoekertje
plaatsen, evaluatie stemmen, gesprek blokkeren, ...) laten mislukken.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_report(
    db,
    r_type: str,
    target_type: str,
    target_id: str,
    message: str,
    target_title: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    """Insert een nieuwe Melding. Zie ReportType/ReportTargetType in models.py
    voor de geldige waarden van r_type/target_type."""
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "type": r_type,
            "status": "open",
            "createdAt": _now_iso(),
            "targetType": target_type,
            "targetId": target_id,
            "targetTitle": target_title,
            "message": message,
            "meta": meta or {},
            "handledByAdminId": None,
            "handledAt": None,
        }
        await db.reports.insert_one(doc)
    except Exception as e:
        logger.warning("Report insert failed (%s/%s): %s", r_type, target_id, e)


async def report_already_exists(
    db,
    r_type: str,
    target_id: str,
    *,
    only_open: bool = False,
    meta_filter: Optional[dict] = None,
) -> bool:
    """Idempotentiecheck: bestaat er al een Melding van dit type voor dit
    target? Gebruikt door de triggers die dat vereisen (PRD §6.1/§6.2) —
    de overige triggers hebben geen idempotentie-vraagstuk (zie PRD §6.3/6.4/6.6)
    of regelen dit anders (§6.5, via het adminReported-veld op game_evaluations)."""
    query: dict = {"type": r_type, "targetId": target_id}
    if only_open:
        query["status"] = "open"
    if meta_filter:
        for k, v in meta_filter.items():
            query[f"meta.{k}"] = v
    existing = await db.reports.find_one(query, {"_id": 0, "id": 1})
    return existing is not None

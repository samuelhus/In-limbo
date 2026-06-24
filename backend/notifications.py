"""Notification & email helpers.

- create_notification: stores an in-app notification document in MongoDB.
- send_email: sends a transactional email via Resend (non-blocking).

Both helpers fail soft — exceptions are logged but never raised to the caller,
so a downstream failure never breaks the core user flow (e.g. applying for a
listing must succeed even if e-mail dispatch fails).
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://limbo-stage.emergent.host").rstrip("/")
MAILERLITE_API_KEY = os.environ.get("MAILERLITE_API_KEY", "")
MAILERLITE_GROUP_ID = os.environ.get("MAILERLITE_GROUP_ID", "")

LOGO_URL = (
    "https://res.cloudinary.com/dbjizykvb/image/upload/v1782338137/logoil_uoqeoo.png"
)


async def create_notification(
    db,
    user_id: str,
    n_type: str,
    message: str,
    listing_id: Optional[str] = None,
    listing_title: Optional[str] = None,
) -> None:
    """Insert an in-app notification."""
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "userId": user_id,
            "type": n_type,
            "message": message,
            "listingId": listing_id,
            "listingTitle": listing_title,
            "read": False,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        await db.notifications.insert_one(doc)
    except Exception as e:
        logger.warning("Notification insert failed: %s", e)


def render_email(
    title: str,
    body_lines: list[str],
    cta_text: Optional[str] = None,
    cta_url: Optional[str] = None,
) -> str:
    """Render a basic transactional email with inline-styled HTML."""
    body_html = "".join(
        f'<p style="margin:0 0 16px 0; font-size:15px; line-height:1.55; color:#333;">{line}</p>'
        for line in body_lines
    )
    cta_html = ""
    if cta_text and cta_url:
        cta_html = f"""
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
          <tr><td>
            <a href="{cta_url}" style="display:inline-block; background:#1A1A1A; color:#fff; text-decoration:none; padding:14px 28px; font-size:14px; font-weight:600; letter-spacing:0.05em;">
              {cta_text}
            </a>
          </td></tr>
        </table>
        """
    return f"""
<!DOCTYPE html>
<html><body style="margin:0; padding:0; background:#F4F4F0; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F4F0; padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px; background:#fff; border-top:4px solid #34D399;">
        <tr><td style="padding:32px 40px 0 40px;">
          <img src="{LOGO_URL}" alt="in—limbo" style="height:32px; display:block;" />
        </td></tr>
        <tr><td style="padding:32px 40px 40px 40px;">
          <h1 style="margin:0 0 20px 0; font-size:22px; font-weight:700; color:#1A1A1A; letter-spacing:-0.01em;">
            {title}
          </h1>
          {body_html}
          {cta_html}
        </td></tr>
        <tr><td style="padding:24px 40px; border-top:1px solid #E5E5E0; background:#FAFAF7;">
          <p style="margin:0; font-size:12px; color:#888; letter-spacing:0.05em;">
            In Limbo · Brussel
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
""".strip()


async def send_email(to_email: str, subject: str, html_content: str) -> None:
    """Send a transactional email via Resend. Fails soft."""
    if not to_email or not resend.api_key:
        return
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }
        await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.warning("Resend email failed (%s → %s): %s", subject, to_email, e)


async def maybe_send_email(
    db,
    user_id: str,
    preference_key: str,
    to_email: Optional[str],
    subject: str,
    html_content: str,
) -> None:
    """Respect user emailPreferences; default is True if missing or unset."""
    if not to_email:
        return
    try:
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "emailPreferences": 1})
        prefs = (user or {}).get("emailPreferences") or {}
        if prefs.get(preference_key) is False:
            return
        await send_email(to_email, subject, html_content)
    except Exception as e:
        logger.warning("maybe_send_email failed: %s", e)


async def purge_old_notifications(db, days: int = 30) -> int:
    """Delete notifications older than `days`."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    res = await db.notifications.delete_many({"createdAt": {"$lt": cutoff}})
    return res.deleted_count


async def sync_to_mailerlite(email: str) -> bool:
    """Add a subscriber to a MailerLite group. Fails soft.

    No-ops (returns False) if MAILERLITE_API_KEY or MAILERLITE_GROUP_ID
    is not configured. On API failure logs a warning and returns False.
    Returns True only on successful API confirmation.
    """
    if not email or not MAILERLITE_API_KEY or not MAILERLITE_GROUP_ID:
        return False
    url = "https://connect.mailerlite.com/api/subscribers"
    payload = {"email": email, "groups": [MAILERLITE_GROUP_ID]}
    headers = {
        "Authorization": f"Bearer {MAILERLITE_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            resp = await cli.post(url, json=payload, headers=headers)
        if resp.status_code in (200, 201):
            return True
        logger.warning("MailerLite sync non-2xx for %s: %s %s", email, resp.status_code, resp.text[:200])
        return False
    except Exception as e:
        logger.warning("MailerLite sync failed for %s: %s", email, e)
        return False


async def notify_admins_contact_message(
    db, name: str, email: str, message: str,
) -> None:
    """Email + in-app notify all admins about a new public contact-form submission."""
    try:
        admins = await db.users.find(
            {"role": "admin"},
            {"_id": 0, "id": 1, "email": 1},
        ).to_list(None)
        if not admins:
            logger.warning("notify_admins_contact_message: geen admins gevonden")
            return

        safe_msg = (message or "").replace("\n", "<br/>")
        in_app = f"Nieuw contactbericht van {name} ({email})"
        email_html = render_email(
            title="Nieuw contactbericht",
            body_lines=[
                f"<strong>{name}</strong> ({email}) heeft een bericht achtergelaten via /contact.",
                f"<em>{safe_msg}</em>",
            ],
            cta_text="Admin panel openen →",
            cta_url=f"{FRONTEND_URL}/admin",
        )
        for admin in admins:
            await create_notification(
                db=db,
                user_id=admin["id"],
                n_type="contact_message",
                message=in_app,
            )
            await send_email(
                to_email=admin.get("email"),
                subject=f"Contactbericht: {name}",
                html_content=email_html,
            )
    except Exception as e:
        logger.warning("notify_admins_contact_message failed: %s", e)


async def notify_admins_new_registration(
    db,
    new_user_firstName: str,
    new_user_lastName: str,
    new_user_email: str,
    org_name: str,
    registration_type: str,  # "new-org" of "existing-org"
) -> None:
    """Stuur in-app notificatie + e-mail naar alle admins bij nieuwe registratie."""
    try:
        admins = await db.users.find(
            {"role": "admin"},
            {"_id": 0, "id": 1, "email": 1, "firstName": 1},
        ).to_list(None)

        if not admins:
            logger.warning("notify_admins_new_registration: geen admins gevonden")
            return

        type_label = "nieuwe organisatie" if registration_type == "new-org" else "bestaande organisatie"
        full_name = f"{new_user_firstName} {new_user_lastName}".strip()
        message = (
            f"{full_name} heeft zich geregistreerd bij {org_name} "
            f"({type_label}) en wacht op validatie."
        )
        admin_url = f"{FRONTEND_URL}/admin"
        email_html = render_email(
            title="Nieuwe registratie",
            body_lines=[
                f"<strong>{full_name}</strong> ({new_user_email}) heeft zich "
                f"geregistreerd bij <strong>{org_name}</strong> ({type_label}).",
                "Deze gebruiker wacht op validatie in het admin panel.",
            ],
            cta_text="Bekijk admin panel →",
            cta_url=admin_url,
        )

        for admin in admins:
            await create_notification(
                db=db,
                user_id=admin["id"],
                n_type="new_registration",
                message=message,
            )
            await send_email(
                to_email=admin.get("email"),
                subject=f"Nieuwe registratie: {full_name} ({org_name})",
                html_content=email_html,
            )
    except Exception as e:
        logger.warning("notify_admins_new_registration failed: %s", e)

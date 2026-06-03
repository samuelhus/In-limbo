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

import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://limbo-stage.emergent.host").rstrip("/")

LOGO_URL = (
    "https://customer-assets.emergentagent.com/job_limbo-stage/artifacts/"
    "qxkvv7hu_in%E2%80%94limbo%20logoblack%20%282%29%20%283%29.png"
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

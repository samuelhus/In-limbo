"""OG-preview endpoint — dient GEEN React-pagina, maar kale HTML met
Open Graph / Twitter meta-tags voor social media crawlers (WhatsApp,
Facebook, LinkedIn, Twitter/X, ...).
"""
from __future__ import annotations

import html
import os

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from deps import db

router = APIRouter()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")

# Valt terug op het favicon/logo als er geen fotos zijn bij de aanbieding
DEFAULT_OG_IMAGE = f"{FRONTEND_URL}/favicon.png"

# Cloudinary levert standaard de volle-resolutie foto. Voor een snelle
# preview-thumbnail vragen we een verkleinde, vierkant-gecropte versie op
# door transformatie-parameters in de URL te injecteren. Dit werkt enkel
# als de URL effectief een Cloudinary-upload-URL is (bevat "/upload/").
def _cloudinary_thumbnail(url: str, width: int = 1200, height: int = 630) -> str:
    """Voegt Cloudinary transformatie-parameters toe voor een OG-vriendelijke
    thumbnail (1200x630 is de door Facebook/WhatsApp aanbevolen ratio).
    Als de foto niet van Cloudinary komt, geven we de originele URL terug.
    """
    marker = "/upload/"
    if marker not in url:
        return url
    prefix, suffix = url.split(marker, 1)
    transform = f"c_fill,w_{width},h_{height},q_auto,f_auto"
    return f"{prefix}{marker}{transform}/{suffix}"


def _escape(text: str) -> str:
    """Escaped tekst veilig voor gebruik in HTML-attributen (voorkomt
    kapotte HTML of injectie als een titel/omschrijving rare tekens bevat)."""
    return html.escape(text or "", quote=True)


@router.get("/og/aanbieding/{slug}", response_class=HTMLResponse)
async def og_preview_listing(slug: str):
    """Geeft minimale HTML terug met dynamische OG-tags voor 1 aanbieding.

    Wordt NOOIT rechtstreeks door een mens bezocht (Caddy filtert op
    User-Agent) — maar voor de zekerheid staat er een meta-refresh in die
    automatisch doorstuurt naar de echte React-pagina, mocht iemand toch
    op deze URL belanden (bv. door de link te delen vanuit de preview zelf).
    """
    listing = await db.listings.find_one({"$or": [{"id": slug}, {"slug": slug}]})

    real_url = f"{FRONTEND_URL}/aanbieding/{slug}"

    if not listing:
        # Onbestaande/verwijderde aanbieding: toon generieke site-preview
        # in plaats van een lege/foute preview te tonen.
        title = "in—limbo · Hergebruik in Brussel"
        description = "In Limbo verbindt donateurs en organisaties in Brussel voor het hergebruik van materialen."
        image = DEFAULT_OG_IMAGE
    else:
        title = f"{listing.get('title', 'Aanbieding')} · in—limbo"
        description = listing.get("description") or "Bekijk deze aanbieding op in—limbo."
        photos = listing.get("photos") or []
        image = _cloudinary_thumbnail(photos[0]) if photos else DEFAULT_OG_IMAGE

    title_esc = _escape(title)
    description_esc = _escape(description)
    image_esc = _escape(image)
    url_esc = _escape(real_url)

    html_body = f"""<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>{title_esc}</title>
<meta property="og:type" content="website" />
<meta property="og:title" content="{title_esc}" />
<meta property="og:description" content="{description_esc}" />
<meta property="og:image" content="{image_esc}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="{url_esc}" />
<meta property="og:site_name" content="in—limbo" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{title_esc}" />
<meta name="twitter:description" content="{description_esc}" />
<meta name="twitter:image" content="{image_esc}" />
<meta http-equiv="refresh" content="0; url={url_esc}" />
<link rel="canonical" href="{url_esc}" />
</head>
<body>
<p>Doorverwijzen naar <a href="{url_esc}">{title_esc}</a>...</p>
</body>
</html>"""

    return HTMLResponse(content=html_body)

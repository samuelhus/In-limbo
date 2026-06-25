"""Bilingual search keyword enrichment for listings.

Strategy:
1. Curated NL<->FR dictionary for common material/object terms.
2. AI fallback (Anthropic via litellm) for terms not in the dictionary.
3. Nightly APScheduler job enriches listings missing searchKeywords.
"""
from __future__ import annotations
import os
import logging
import asyncio

log = logging.getLogger("inlimbo")

# ---------------------------------------------------------------------------
# Curated bilingual dictionary  (NL -> FR and FR -> NL, both directions)
# ---------------------------------------------------------------------------
DICTIONARY: dict[str, list[str]] = {
    # furniture
    "stoel": ["chaise", "siège"],
    "stoelen": ["chaises", "sièges"],
    "chaise": ["stoel", "zetel"],
    "chaises": ["stoelen", "zetels"],
    "tafel": ["table", "bureau"],
    "tafels": ["tables"],
    "table": ["tafel", "bureau"],
    "tables": ["tafels"],
    "bureau": ["bureau", "schrijftafel", "tafel"],
    "kast": ["armoire", "placard", "étagère"],
    "kasten": ["armoires", "placards"],
    "armoire": ["kast", "kleerkast"],
    "bank": ["canapé", "sofa", "banc"],
    "sofa": ["bank", "canapé"],
    "canapé": ["bank", "sofa"],
    "rek": ["étagère", "rayonnage"],
    "rekken": ["étagères"],
    "étagère": ["rek", "plank"],
    "plank": ["étagère", "planche", "tablette"],
    "planken": ["étagères", "planches"],
    "stelling": ["étagère", "rayonnage"],
    "stellingen": ["étagères", "rayonnages"],
    "zetel": ["fauteuil", "chaise", "siège"],
    "zetels": ["fauteuils"],
    "fauteuil": ["zetel", "leunstoel"],
    "bed": ["lit"],
    "lit": ["bed"],
    "matras": ["matelas"],
    "matelas": ["matras"],
    "lamp": ["lampe", "luminaire"],
    "lampen": ["lampes"],
    "lampe": ["lamp"],
    # wood / construction
    "hout": ["bois", "bois de construction"],
    "houten": ["en bois", "bois"],
    "bois": ["hout", "houten"],
    "plaat": ["panneau", "plaque"],
    "platen": ["panneaux", "plaques"],
    "panneau": ["plaat", "paneel"],
    "panneaux": ["platen"],
    "balk": ["poutre", "madrier"],
    "balken": ["poutres"],
    "poutre": ["balk"],
    "poutres": ["balken"],
    "multiplex": ["contreplaqué", "multiplex"],
    "contreplaqué": ["multiplex"],
    "spaanplaat": ["aggloméré", "particule"],
    "aggloméré": ["spaanplaat"],
    "mdf": ["mdf"],
    # metal
    "metaal": ["métal", "acier", "fer"],
    "metalen": ["métallique", "en métal"],
    "métal": ["metaal"],
    "staal": ["acier"],
    "acier": ["staal"],
    "ijzer": ["fer", "acier"],
    "fer": ["ijzer"],
    "aluminium": ["aluminium"],
    "koper": ["cuivre"],
    "cuivre": ["koper"],
    # fabric / textile
    "stof": ["tissu", "textile", "étoffe"],
    "stoffen": ["tissus", "textiles"],
    "tissu": ["stof", "textiel"],
    "tissus": ["stoffen"],
    "textiel": ["textile", "tissu"],
    "textile": ["textiel", "stof"],
    "gordijn": ["rideau", "voilage"],
    "gordijnen": ["rideaux"],
    "rideau": ["gordijn"],
    "rideaux": ["gordijnen"],
    "tapijt": ["tapis", "moquette"],
    "tapis": ["tapijt", "kleed"],
    "kleed": ["tapis", "teppich"],
    "leer": ["cuir"],
    "cuir": ["leer"],
    # paper / print
    "papier": ["papier"],
    "karton": ["carton"],
    "carton": ["karton"],
    "dozen": ["boîtes", "cartons"],
    "doos": ["boîte", "carton"],
    "boîte": ["doos"],
    "drukwerk": ["imprimés", "impression"],
    "affiches": ["affiches", "posters"],
    "poster": ["affiche", "poster"],
    # decor / props
    "decoratie": ["décoration", "décor"],
    "decor": ["décor", "décoration"],
    "décoration": ["decoratie"],
    "décor": ["decor"],
    "rekwisieten": ["accessoires", "props"],
    "rekwisiet": ["accessoire", "prop"],
    "accessoires": ["rekwisieten"],
    "verf": ["peinture"],
    "peinture": ["verf"],
    "verlichting": ["éclairage", "lumière"],
    "éclairage": ["verlichting"],
    "licht": ["lumière", "éclairage"],
    "lumière": ["licht"],
    "spiegel": ["miroir"],
    "miroir": ["spiegel"],
    "kleding": ["vêtements", "habits"],
    "vêtements": ["kleding"],
    "kostuum": ["costume"],
    "kostuums": ["costumes"],
    "costume": ["kostuum"],
    "schoenen": ["chaussures"],
    "chaussures": ["schoenen"],
    # electronics / equipment
    "kabel": ["câble"],
    "kabels": ["câbles"],
    "câble": ["kabel"],
    "elektrisch": ["électrique"],
    "électrique": ["elektrisch"],
    "computer": ["ordinateur"],
    "ordinateur": ["computer"],
    "scherm": ["écran"],
    "écran": ["scherm"],
    "luidspreker": ["haut-parleur", "enceinte"],
    "haut-parleur": ["luidspreker"],
    "camera": ["caméra", "appareil photo"],
    "caméra": ["camera"],
    # misc
    "kratten": ["caisses", "cageots"],
    "krat": ["caisse", "cageot"],
    "caisse": ["krat"],
    "pallet": ["palette"],
    "palette": ["pallet"],
    "container": ["conteneur", "bac"],
    "conteneur": ["container"],
    "gereedschap": ["outils", "outillage"],
    "outils": ["gereedschap"],
    "speelgoed": ["jouets"],
    "jouets": ["speelgoed"],
    "boeken": ["livres"],
    "boek": ["livre"],
    "livre": ["boek"],
    "livres": ["boeken"],
}


def _curated_translations(text: str) -> list[str]:
    """Return curated cross-language synonyms for words found in text."""
    words = text.lower().split()
    extras: set[str] = set()
    for word in words:
        clean = word.strip(".,;:!?()")
        if clean in DICTIONARY:
            extras.update(DICTIONARY[clean])
    return list(extras)


async def _ai_translations(text: str) -> list[str]:
    """Use Anthropic Claude Haiku (via Emergent LLM key) as fallback for unusual terms."""
    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        return []
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        prompt = (
            f"Given this Dutch or French text from a material listing: '{text[:200]}'\n"
            "Return ONLY a JSON array of 5-10 keywords that are translations or synonyms "
            "in the OTHER language (if Dutch give French, if French give Dutch). "
            "Only common material/object words. No explanation, just the JSON array."
        )
        chat = (
            LlmChat(
                api_key=api_key,
                session_id=f"kw-{abs(hash(text[:50])) % 10_000_000}",
                system_message="You are a precise bilingual NL<->FR translator. Output ONLY a JSON array of translated keywords, no explanations.",
            )
            .with_model("anthropic", "claude-haiku-4-5-20251001")
            .with_params(max_tokens=200)
        )
        raw = await chat.send_message(UserMessage(text=prompt))
        if not isinstance(raw, str):
            return []
        import json
        import re
        match = re.search(r"\[.*?\]", raw, re.DOTALL)
        if match:
            keywords = json.loads(match.group())
            return [k.lower() for k in keywords if isinstance(k, str)]
    except Exception as e:
        log.warning(f"AI translation fallback failed: {e}")
    return []


async def enrich_listing_keywords(listing: dict) -> list[str]:
    """Generate searchKeywords for a single listing."""
    parts = " ".join(filter(None, [
        listing.get("title", ""),
        listing.get("description", ""),
        listing.get("material", ""),
    ]))
    curated = _curated_translations(parts)
    # Only call AI if curated dict gave nothing useful
    if not curated:
        ai = await _ai_translations(parts)
        return list(set(curated + ai))
    return list(set(curated))


async def run_keyword_enrichment(db) -> int:
    """Nightly job: enrich listings that have no searchKeywords yet."""
    count = 0
    cursor = db.listings.find(
        {"searchKeywords": {"$exists": False}},
        {"_id": 0, "id": 1, "title": 1, "description": 1, "material": 1},
    )
    async for listing in cursor:
        try:
            keywords = await enrich_listing_keywords(listing)
            await db.listings.update_one(
                {"id": listing["id"]},
                {"$set": {"searchKeywords": keywords}},
            )
            count += 1
            await asyncio.sleep(0.05)  # gentle rate limiting
        except Exception as e:
            log.warning(f"Keyword enrichment failed for {listing['id']}: {e}")
    log.info(f"Keyword enrichment: enriched {count} listings")
    return count

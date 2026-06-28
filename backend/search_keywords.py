"""Bilingual search keyword enrichment for listings.

Strategy:
1. Curated NL<->FR dictionary for common material/object terms.
2. AI fallback (Anthropic via litellm) for terms not in the dictionary.
3. Nightly APScheduler job enriches listings missing searchKeywords.
"""
from __future__ import annotations
import os
import re
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
    # event / stage
    "podium": ["scène", "estrade"],
    "scènes": ["podia"],
    "scène": ["podium"],
    "microfoon": ["microphone", "micro"],
    "microfoons": ["microphones"],
    "microphone": ["microfoon"],
    "microphones": ["microfoons"],
    "mengpaneel": ["table de mixage", "mixeur"],
    "mengpanelen": ["tables de mixage"],
    "table de mixage": ["mengpaneel"],
    "projector": ["projecteur", "beamer"],
    "projectoren": ["projecteurs"],
    "projecteur": ["projector"],
    "projecteurs": ["projectoren"],
    "beamer": ["projecteur"],
    "versterker": ["amplificateur"],
    "versterkers": ["amplificateurs"],
    "amplificateur": ["versterker"],
    "headset": ["casque micro"],
    "headsets": ["casques micro"],
    "koptelefoon": ["casque audio"],
    "koptelefoons": ["casques audio"],
    "statief": ["trépied"],
    "statieven": ["trépieds"],
    "trépied": ["statief"],
    "spot": ["spot lumineux"],
    "spots": ["spots lumineux"],
    "dimmer": ["gradateur"],
    "dimmers": ["gradateurs"],

    # tents / outdoor
    "tent": ["tente"],
    "tenten": ["tentes"],
    "tente": ["tent"],
    "tentes": ["tenten"],
    "partytent": ["chapiteau", "tente"],
    "partytenten": ["chapiteaux"],
    "chapiteau": ["partytent"],
    "chapiteaux": ["partytenten"],
    "parasol": ["parasol"],
    "parasols": ["parasols"],
    "hekwerk": ["barrière"],
    "barrière": ["hekwerk"],
    "dranghek": ["barrière de sécurité"],
    "dranghekken": ["barrières de sécurité"],
    "vlag": ["drapeau"],
    "vlaggen": ["drapeaux"],
    "drapeau": ["vlag"],
    "drapeaux": ["vlaggen"],
    "banner": ["bannière"],
    "banners": ["bannières"],
    "bannière": ["banner"],
    "bannières": ["banners"],

    # office / administration
    "printer": ["imprimante"],
    "printers": ["imprimantes"],
    "imprimante": ["printer"],
    "imprimantes": ["printers"],
    "scanner": ["scanner"],
    "scanners": ["scanners"],
    "laptop": ["ordinateur portable"],
    "laptops": ["ordinateurs portables"],
    "ordinateur portable": ["laptop"],
    "whiteboard": ["tableau blanc"],
    "whiteboards": ["tableaux blancs"],
    "tableau blanc": ["whiteboard"],
    "flipchart": ["paperboard"],
    "flipcharts": ["paperboards"],
    "paperboard": ["flipchart"],
    "vergadertafel": ["table de réunion"],
    "vergadertafels": ["tables de réunion"],
    "table de réunion": ["vergadertafel"],
    "archiefkast": ["armoire d'archives"],
    "archiefkasten": ["armoires d'archives"],
    "armoire d'archives": ["archiefkast"],
    "locker": ["casier"],
    "lockers": ["casiers"],
    "casier": ["locker"],

    # kitchen / catering
    "koelkast": ["frigo", "réfrigérateur"],
    "koelkasten": ["frigos", "réfrigérateurs"],
    "frigo": ["koelkast"],
    "frigos": ["koelkasten"],
    "réfrigérateur": ["koelkast"],
    "koffiezet": ["cafetière"],
    "koffiezetten": ["cafetières"],
    "cafetière": ["koffiezet"],
    "waterkoker": ["bouilloire"],
    "waterkokers": ["bouilloires"],
    "bouilloire": ["waterkoker"],
    "servies": ["vaisselle"],
    "vaisselle": ["servies"],
    "glas": ["verre"],
    "glazen": ["verres"],
    "verre": ["glas"],
    "verres": ["glazen"],
    "bestek": ["couverts"],
    "couverts": ["bestek"],
    "thermos": ["thermos"],
    "dienblad": ["plateau"],
    "dienbladen": ["plateaux"],
    "plateau": ["dienblad"],
    "plateaux": ["dienbladen"],
    "buffettafel": ["table buffet"],
    "buffettafels": ["tables buffet"],
    "table buffet": ["buffettafel"],

    # workshop / creative
    "schaar": ["ciseaux"],
    "scharen": ["ciseaux"],
    "ciseaux": ["schaar"],
    "lijm": ["colle"],
    "colle": ["lijm"],
    "borstel": ["brosse"],
    "borstels": ["brosses"],
    "brosse": ["borstel"],
    "kwast": ["pinceau"],
    "kwasten": ["pinceaux"],
    "pinceau": ["kwast"],
    "pinceaux": ["kwasten"],
    "klei": ["argile"],
    "argile": ["klei"],
    "naaimachine": ["machine à coudre"],
    "naaimachines": ["machines à coudre"],
    "machine à coudre": ["naaimachine"],
    "verfroller": ["rouleau à peinture"],
    "verfrollers": ["rouleaux à peinture"],
    "textielverf": ["peinture textile"],
    "peinture textile": ["textielverf"],

    # youth / education
    "spel": ["jeu"],
    "spellen": ["jeux"],
    "jeu": ["spel"],
    "jeux": ["spellen"],
    "bordspel": ["jeu de société"],
    "bordspellen": ["jeux de société"],
    "jeu de société": ["bordspel"],
    "knutselmateriaal": ["matériel créatif", "bricolage"],
    "bricolage": ["knutselmateriaal"],
    "educatief": ["éducatif"],
    "éducatif": ["educatief"],
    "lesmateriaal": ["matériel pédagogique"],
    "matériel pédagogique": ["lesmateriaal"],
    "werkboek": ["cahier d'exercices"],
    "werkboeken": ["cahiers d'exercices"],
    "cahier d'exercices": ["werkboek"],

    # children
    "bouwblokken": ["blocs de construction"],
    "blocs de construction": ["bouwblokken"],
    "puzzel": ["puzzle"],
    "puzzels": ["puzzles"],
    "puzzle": ["puzzel"],
    "puzzles": ["puzzels"],
    "speelgoedkist": ["coffre à jouets"],
    "coffre à jouets": ["speelgoedkist"],
    "speelmat": ["tapis de jeu"],
    "speelmatten": ["tapis de jeu"],

    # sports
    "bal": ["ballon", "balle"],
    "ballon": ["bal"],
    "fiets": ["vélo"],
    "fietsen": ["vélos"],
    "vélo": ["fiets"],
    "vélos": ["fietsen"],
    "helm": ["casque"],
    "helmen": ["casques"],
    "casque": ["helm"],
    "casques": ["helmen"],
    "tafeltennis": ["ping-pong"],
    "ping-pong": ["tafeltennis"],
    "badminton": ["badminton"],
    "volleybal": ["volleyball"],
    "volleyball": ["volleybal"],
    "basketbal": ["basket-ball"],
    "basket-ball": ["basketbal"],
    "doel": ["but"],
    "doelen": ["buts"],
    "but": ["doel"],
    "buts": ["doelen"],

    # music
    "gitaar": ["guitare"],
    "gitaren": ["guitares"],
    "guitare": ["gitaar"],
    "guitares": ["gitaren"],
    "piano": ["piano"],
    "keyboard": ["clavier"],
    "keyboards": ["claviers"],
    "clavier": ["keyboard"],
    "drumstel": ["batterie"],
    "drumstellen": ["batteries"],
    "batterie": ["drumstel"],
    "muziekstandaard": ["pupitre"],
    "muziekstandaards": ["pupitres"],
    "pupitre": ["muziekstandaard"],

    # exhibition
    "vitrine": ["vitrine"],
    "vitrines": ["vitrines"],
    "sokkel": ["socle"],
    "sokkels": ["socles"],
    "socle": ["sokkel"],
    "socles": ["sokkels"],
    "tentoonstelling": ["exposition"],
    "tentoonstellingen": ["expositions"],
    "exposition": ["tentoonstelling"],
    "expositions": ["tentoonstellingen"],
    "display": ["présentoir"],
    "displays": ["présentoirs"],
    "présentoir": ["display"],
    "infobord": ["panneau d'information"],
    "infoborden": ["panneaux d'information"],

    # gardening
    "plantenbak": ["bac à plantes"],
    "plantenbakken": ["bacs à plantes"],
    "bac à plantes": ["plantenbak"],
    "schop": ["pelle"],
    "schoppen": ["pelles"],
    "pelle": ["schop"],
    "pelles": ["schoppen"],
    "hark": ["râteau"],
    "harken": ["râteaux"],
    "râteau": ["hark"],
    "gieter": ["arrosoir"],
    "gieters": ["arrosoirs"],
    "arrosoir": ["gieter"],

    # transport / storage
    "bakfiets": ["vélo cargo"],
    "bakfietsen": ["vélos cargo"],
    "vélo cargo": ["bakfiets"],
    "aanhangwagen": ["remorque"],
    "aanhangwagens": ["remorques"],
    "remorque": ["aanhangwagen"],
    "transportkar": ["chariot"],
    "transportkarren": ["chariots"],
    "chariot": ["transportkar"],
    "opbergbox": ["boîte de rangement"],
    "opbergboxen": ["boîtes de rangement"],

    # accessibility
    "rolstoel": ["fauteuil roulant"],
    "rolstoelen": ["fauteuils roulants"],
    "fauteuil roulant": ["rolstoel"],
    "looprek": ["déambulateur"],
    "looprekken": ["déambulateurs"],
    "déambulateur": ["looprek"],

    # safety
    "ehbo": ["premiers secours"],
    "ehbo-kit": ["trousse de secours"],
    "trousse de secours": ["ehbo-kit"],
    "brandblusser": ["extincteur"],
    "brandblussers": ["extincteurs"],
    "extincteur": ["brandblusser"],
    "veiligheidsvest": ["gilet de sécurité"],
    "veiligheidsvesten": ["gilets de sécurité"],

    # sustainability
    "herbruikbaar": ["réutilisable"],
    "réutilisable": ["herbruikbaar"],
    "recycleerbaar": ["recyclable"],
    "recyclable": ["recycleerbaar"],
    "compostbak": ["bac à compost"],
    "compostbakken": ["bacs à compost"],

    # digital
    "tablet": ["tablette"],
    "tablette": ["tablet"],
    "wifi": ["wifi"],
    "router": ["routeur"],
    "routeur": ["router"],
    "hotspot": ["point d'accès"],
    "point d'accès": ["hotspot"],
    "videoconferentie": ["visioconférence"],
    "visioconférence": ["videoconferentie"],

    # community
    "vrijwilliger": ["bénévole"],
    "vrijwilligers": ["bénévoles"],
    "bénévole": ["vrijwilliger"],
    "bénévoles": ["vrijwilligers"],
    "evenement": ["événement"],
    "evenementen": ["événements"],
    "événement": ["evenement"],
    "événements": ["evenementen"],
    "festival": ["festival"],
    "festivals": ["festivals"],
    "ticket": ["billet"],
    "tickets": ["billets"],
    "billet": ["ticket"],
    "billets": ["tickets"],
    "inschrijving": ["inscription"],
    "inschrijvingen": ["inscriptions"],
    "inscription": ["inschrijving"],
    "inscriptions": ["inschrijvingen"],

    # categories - furniture
    "meubilair": ["mobilier"],
    "mobilier": ["meubilair"],
    "meubels": ["meubles"],
    "meubles": ["meubels"],

    # categories - wood / construction
    "bouwmateriaal": ["matériaux de construction"],
    "bouwmaterialen": ["matériaux de construction"],
    "matériaux de construction": ["bouwmaterialen"],
    "houtmateriaal": ["matériaux en bois"],
    "matériaux en bois": ["houtmateriaal"],

    # categories - metal
    "metaalmateriaal": ["matériel métallique"],
    "metaalmaterialen": ["matériels métalliques"],
    "matériel métallique": ["metaalmateriaal"],

    # categories - plastic
    "kunststof": ["plastique"],
    "kunststoffen": ["plastiques"],
    "plastique": ["kunststof"],
    "plastiques": ["kunststoffen"],

    # categories - textile
    "textielmateriaal": ["matériel textile"],
    "textielmaterialen": ["matériels textiles"],
    "matériel textile": ["textielmateriaal"],

    # categories - paper / print
    "drukwerk": ["imprimés", "impression"],
    "printmateriaal": ["matériel imprimé"],
    "matériel imprimé": ["printmateriaal"],

    # categories - decoration
    "decoratiemateriaal": ["matériel de décoration"],
    "decoratiematerialen": ["matériels de décoration"],
    "matériel de décoration": ["decoratiemateriaal"],

    # categories - events
    "evenementmateriaal": ["matériel événementiel"],
    "evenementmaterialen": ["matériels événementiels"],
    "matériel événementiel": ["evenementmateriaal"],
    "festivalmateriaal": ["matériel de festival"],
    "matériel de festival": ["festivalmateriaal"],

    # categories - stage
    "podiummateriaal": ["matériel de scène"],
    "podiummaterialen": ["matériels de scène"],
    "matériel de scène": ["podiummateriaal"],
    "scènemateriaal": ["matériel de scène"],

    # categories - lighting
    "verlichting": ["éclairage", "lumière"],
    "lichtmateriaal": ["matériel d'éclairage"],
    "lichtmaterialen": ["matériels d'éclairage"],
    "matériel d'éclairage": ["lichtmateriaal"],

    # categories - audio
    "audiomateriaal": ["matériel audio", "sonorisation"],
    "audiomaterialen": ["matériels audio"],
    "matériel audio": ["audiomateriaal"],
    "sonorisation": ["audiomateriaal"],

    # categories - video
    "videomateriaal": ["matériel vidéo"],
    "videomaterialen": ["matériels vidéo"],
    "matériel vidéo": ["videomateriaal"],

    # categories - IT
    "ict": ["informatique"],
    "informatique": ["ict"],
    "ict-materiaal": ["matériel informatique"],
    "ict-materialen": ["matériels informatiques"],
    "matériel informatique": ["ict-materiaal"],

    # categories - office
    "kantoormateriaal": ["matériel de bureau"],
    "kantoormaterialen": ["matériels de bureau"],
    "matériel de bureau": ["kantoormateriaal"],

    # categories - workshop
    "ateliermateriaal": ["matériel d'atelier"],
    "ateliermaterialen": ["matériels d'atelier"],
    "matériel d'atelier": ["ateliermateriaal"],
    "makerspace": ["atelier partagé"],
    "atelier partagé": ["makerspace"],

    # categories - arts & crafts
    "creatief materiaal": ["matériel créatif"],
    "creatieve materialen": ["matériels créatifs"],
    "matériel créatif": ["creatief materiaal"],
    "knutselmateriaal": ["matériel de bricolage"],
    "matériel de bricolage": ["knutselmateriaal"],

    # categories - education
    "educatief materiaal": ["matériel pédagogique"],
    "educatieve materialen": ["matériels pédagogiques"],
    "matériel pédagogique": ["educatief materiaal"],
    "onderwijsmateriaal": ["matériel éducatif"],
    "matériel éducatif": ["onderwijsmateriaal"],

    # categories - youth
    "jeugdmateriaal": ["matériel jeunesse"],
    "jeugdmaterialen": ["matériels jeunesse"],
    "matériel jeunesse": ["jeugdmateriaal"],

    # categories - music
    "muziekmateriaal": ["matériel musical"],
    "muziekmaterialen": ["matériels musicaux"],
    "matériel musical": ["muziekmateriaal"],

    # categories - sports
    "sportmateriaal": ["matériel sportif"],
    "sportmaterialen": ["matériels sportifs"],
    "matériel sportif": ["sportmateriaal"],
    "sportuitrusting": ["équipement sportif"],
    "équipement sportif": ["sportuitrusting"],

    # categories - exhibition
    "tentoonstellingsmateriaal": ["matériel d'exposition"],
    "tentoonstellingsmaterialen": ["matériels d'exposition"],
    "matériel d'exposition": ["tentoonstellingsmateriaal"],

    # categories - kitchen
    "keukenmateriaal": ["matériel de cuisine"],
    "keukenmaterialen": ["matériels de cuisine"],
    "matériel de cuisine": ["keukenmateriaal"],
    "cateringmateriaal": ["matériel de catering"],
    "matériel de catering": ["cateringmateriaal"],

    # categories - gardening
    "tuinmateriaal": ["matériel de jardin"],
    "tuinmaterialen": ["matériels de jardin"],
    "matériel de jardin": ["tuinmateriaal"],

    # categories - storage
    "opslagmateriaal": ["matériel de stockage"],
    "opslagmaterialen": ["matériels de stockage"],
    "matériel de stockage": ["opslagmateriaal"],

    # categories - transport
    "transportmateriaal": ["matériel de transport"],
    "transportmaterialen": ["matériels de transport"],
    "matériel de transport": ["transportmateriaal"],

    # categories - accessibility
    "toegankelijkheid": ["accessibilité"],
    "accessibilité": ["toegankelijkheid"],
    "toegankelijkheidsmateriaal": ["matériel d'accessibilité"],
    "matériel d'accessibilité": ["toegankelijkheidsmateriaal"],

    # categories - safety
    "veiligheidsmateriaal": ["matériel de sécurité"],
    "veiligheidsmaterialen": ["matériels de sécurité"],
    "matériel de sécurité": ["veiligheidsmateriaal"],

    # categories - sustainability
    "duurzaamheid": ["durabilité"],
    "durabilité": ["duurzaamheid"],
    "hergebruik": ["réemploi"],
    "réemploi": ["hergebruik"],
    "duurzaam materiaal": ["matériel durable"],
    "matériel durable": ["duurzaam materiaal"],

    # categories - community
    "gemeenschapsmateriaal": ["matériel communautaire"],
    "gemeenschapsmaterialen": ["matériels communautaires"],
    "matériel communautaire": ["gemeenschapsmateriaal"],
    "verenigingsmateriaal": ["matériel associatif"],
    "matériel associatif": ["verenigingsmateriaal"],

    # generic
    "materiaal": ["matériel", "équipement", "ressource"],
    "materialen": ["matériels", "équipements", "ressources"],
    "matériel": ["materiaal"],
    "matériels": ["materialen"],
    "équipement": ["uitrusting", "materiaal"],
    "équipements": ["uitrustingen", "materialen"],

    # Wood-based materials
    "multiplex": ["contreplaqué", "plywood"],
    "contreplaqué": ["multiplex"],
    "mdf": ["mdf"],
    "osb": ["osb"],
    "spaanplaat": ["aggloméré"],
    "aggloméré": ["spaanplaat"],
    "massief hout": ["bois massif", "solid wood"],
    "bois massif": ["massief hout"],
    "gelamelleerd hout": ["bois lamellé", "glulam"],
    "bois lamellé": ["gelamelleerd hout"],
    "hpl": ["trespa", "compact laminate"],
    "trespa": ["hpl"],

    # Metal
    "metaal": ["métal"],
    "galvanisé": ["verzinkt"],
    "verzinkt": ["galvanisé"],
    "inox": ["inox", "roestvrij staal"],
    "roestvrij staal": ["inox"],
    "acier": ["staal"],
    "staal": ["acier"],
    "aluminium": ["aluminium"],
    "koper": ["cuivre"],
    "cuivre": ["koper"],
    "laiton": ["messing"],
    "messing": ["laiton"],

    # Plastic
    "pp": ["polypropyleen", "polypropylene"],
    "polypropyleen": ["pp"],
    "hdpe": ["hdpe", "hogedichtheid polyethyleen"],
    "ldpe": ["ldpe", "lagedichtheid polyethyleen"],
    "pet": ["pet", "polyester kunststof"],
    "polystyreen": ["polystyrene"],
    "polystyrene": ["polystyreen"],
    "acryl": ["acrylique", "plexiglas"],
    "plexiglas": ["acryl"],
    "pvc": ["pvc"],
    "polycarbonaat": ["polycarbonate"],
    "polycarbonate": ["polycarbonaat"],

    # Textile
    "katoen": ["coton"],
    "coton": ["katoen"],
    "polyester": ["polyester"],
    "molton": ["molton"],
    "bashe": ["bâche", "zeildoek"],
    "bâche": ["bashe"],

    # Isolation
    "pu": ["polyurethaan"],
    "polyurethaan": ["pu"],
    "rotswol": ["laine de roche"],
    "laine de roche": ["rotswol"],
    "glaswol": ["laine de verre"],
    "laine de verre": ["glaswol"],
    "houtwol": ["laine de bois"],
    "laine de bois": ["houtwol"],

    # Assembly / fasteners
    "scharnier": ["charnière"],
    "charnière": ["scharnier"],
    "rivet": ["rivet"],
    "nagel": ["clou"],
    "clou": ["nagel"],
    "vis": ["schroef"],
    "schroef": ["vis"],
    "tirefond": ["coach screw", "houtdraadbout"],
    "boulon": ["bout"],
    "bout": ["boulon"],
    "écrou": ["moer"],
    "moer": ["écrou"],
    "écrou papillon": ["vleugelmoer"],
    "vleugelmoer": ["écrou papillon"],
    "écrou autofrein": ["borgmoer"],
    "borgmoer": ["écrou autofrein"],
    "rondelle": ["ring"],
    "ring": ["rondelle"],
    "colle": ["lijm"],
    "lijm": ["colle"],
    "soudure": ["lassen"],
    "lassen": ["soudure"],
    "agrafe": ["nietje"],
    "nietje": ["agrafe"],

    # Other materials
    "glasvezel": ["fibre de verre", "fiberglass"],
    "fibre de verre": ["glasvezel"],
    "papier": ["papier"],
    "vinyl": ["vinyle"],
    "vinyle": ["vinyl"],
    "cement": ["ciment"],
    "ciment": ["cement"],
    "pleister": ["plâtre"],
    "plâtre": ["pleister"],
    "terracotta": ["terre cuite"],
    "terre cuite": ["terracotta"],
    "zand": ["sable"],
    "sable": ["zand"],
    "keramiek": ["céramique"],
    "céramique": ["keramiek"],
    "verf": ["peinture"],
    "peinture": ["verf"],
    "vernis": ["vernis"],
    "lak": ["vernis"],

}


_WORD_RE = re.compile(r"[a-zà-ÿœ]+", re.IGNORECASE)
MIN_PREFIX_KEY_LEN = 4  # below this, only exact matches count — avoids "pp"/"vis"/"bal" etc. matching inside unrelated words


def _curated_translations(text: str) -> list[str]:
    """Return curated cross-language synonyms for words found in text.

    Matches dictionary keys both exactly AND as a *prefix* of a longer word,
    so a Dutch compound like "verfresten" (verf + resten) still triggers the
    "verf" -> "peinture" translation — the same substring-matching principle
    now used by the catalogue search itself (see listings.py), instead of
    only ever matching whole tokens.

    Prefix-only (not "anywhere in the word") on purpose: Dutch compounds put
    the qualifying noun at the *start* ("verfroller", "houtblok", ...), so
    matching the start is linguistically correct and far less noisy than a
    free substring match — which would, for example, make the 3-letter key
    "vis" match inside completely unrelated words like "advies" or "visie".
    """
    words = _WORD_RE.findall(text.lower())
    extras: set[str] = set()
    for word in words:
        for key, translations in DICTIONARY.items():
            if word == key or (len(key) >= MIN_PREFIX_KEY_LEN and word.startswith(key)):
                extras.update(translations)
    return list(extras)


async def _ai_translations(text: str) -> list[str]:
    """Use Anthropic API directly as fallback for unusual terms not in the curated dict."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return []
    try:
        import httpx
        import json
        prompt = (
            f"Given this Dutch or French text from a material listing: '{text[:200]}'\n"
            "Return ONLY a JSON array of 5-10 keywords that are translations or synonyms "
            "in the OTHER language (if Dutch give French, if French give Dutch). "
            "Only common material/object words. No explanation, just the JSON array."
        )
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 200,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
        data = resp.json()
        raw = data["content"][0]["text"].strip()
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

"""Impact-berekeningen: CO2 bespaard door hergebruik van materialen op In Limbo.

METHODOLOGIE — samengevat
--------------------------
Voor elke materiaalcategorie (dezelfde categorieën als `ListingMaterial` in
models.py) ligt hier een gemiddelde CO2-uitstoot vast die de productie van
1 kg NIEUW materiaal in die categorie met zich meebrengt (kg CO2-equivalent
per kg). Wanneer materiaal via In Limbo hergebruikt wordt i.p.v. nieuw
geproduceerd, tellen we die uitstoot als "bespaard".

Voor de volledige toelichting, de bronvermelding per cijfer, en de gekozen
methodologie (incl. de expliciete keuze om voor "Ander" de MEDIAAN i.p.v.
het gemiddelde van de overige categorieën te gebruiken, net om de Electro-
uitschieter niet te laten domineren) zie de publieke verantwoordingspagina:

    frontend/src/pages/ImpactMethodologie.jsx  (route: /impact-methodologie)

BELANGRIJK: wijzig een factor hieronder NOOIT zonder ook die pagina bij te
werken — de cijfers moeten 1-op-1 overeenkomen, anders klopt de
verantwoording niet meer met wat de site daadwerkelijk berekent.

Nog NIET opgenomen (bewuste keuze, zie gesprek met de opdrachtgever):
- Financiële impact (€ bespaard). Komt er later bij, waarschijnlijk op basis
  van marktwaarde-schattingen per materiaal i.p.v. de CO2-monetarisering
  die TOTEM gebruikt (€0,05/kg CO2-eq) — dat laatste werd expliciet NIET
  gekozen.
"""
from __future__ import annotations
from typing import Optional

# kg CO2-equivalent bespaard per kg hergebruikt materiaal, per categorie.
# Bronnen + toelichting per waarde: zie /impact-methodologie.
CO2_FACTORS_KG_PER_KG: dict[str, float] = {
    "Hout": 0.4,
    "Metaal": 2.8,
    "Plastic": 3.0,
    "Steen": 0.22,
    "Textiel": 4.0,
    "Electro": 24.9,
    "Vloeistof": 2.5,   # proxy: verf
    "Papier": 1.0,
    "Isolatie": 1.8,
    "Ander": 2.5,       # mediaan van de 9 bovenstaande categorieën
}

# Categorie die gebruikt wordt als een materiaal ontbreekt of niet herkend wordt.
FALLBACK_CATEGORY = "Ander"
DEFAULT_FACTOR = CO2_FACTORS_KG_PER_KG[FALLBACK_CATEGORY]


def co2_factor_for(material: Optional[str]) -> float:
    """Geeft de kg CO2-eq/kg-factor voor een materiaalcategorie, met fallback
    naar de 'Ander'-factor bij onbekend/ontbrekend materiaal."""
    return CO2_FACTORS_KG_PER_KG.get(material or "", DEFAULT_FACTOR)


def co2_saved_kg(material: Optional[str], weight_kg: Optional[float]) -> float:
    """CO2 (kg CO2-eq) bespaard door dit gewicht van dit materiaal te
    hergebruiken i.p.v. nieuw te produceren."""
    if not weight_kg or weight_kg <= 0:
        return 0.0
    return round(weight_kg * co2_factor_for(material), 3)


def _empty_totals() -> dict:
    return {"totalWeightKg": 0.0, "totalCo2Kg": 0.0, "byCategory": {}}


def summarize_flat(
    docs: list[dict],
    material_key: str = "material",
    weight_key: str = "weightKg",
) -> dict:
    """Aggregeer een lijst 'platte' documenten (één materiaal per document,
    zoals platform_transfers) tot totalen + een uitsplitsing per categorie."""
    totals = _empty_totals()
    by_category: dict[str, dict] = {}

    for doc in docs:
        weight = float(doc.get(weight_key) or 0)
        if weight <= 0:
            continue
        material = doc.get(material_key) or FALLBACK_CATEGORY
        co2 = co2_saved_kg(material, weight)

        totals["totalWeightKg"] += weight
        totals["totalCo2Kg"] += co2

        bucket = by_category.setdefault(material, {"weightKg": 0.0, "co2Kg": 0.0, "count": 0})
        bucket["weightKg"] += weight
        bucket["co2Kg"] += co2
        bucket["count"] += 1

    for bucket in by_category.values():
        bucket["weightKg"] = round(bucket["weightKg"], 2)
        bucket["co2Kg"] = round(bucket["co2Kg"], 2)

    totals["totalWeightKg"] = round(totals["totalWeightKg"], 2)
    totals["totalCo2Kg"] = round(totals["totalCo2Kg"], 2)
    totals["byCategory"] = by_category
    return totals


def summarize_nested(
    docs: list[dict],
    items_key: str = "items",
    material_key: str = "material",
    weight_key: str = "weightKg",
) -> dict:
    """Aggregeer documenten die zelf een lijst van items bevatten (zoals
    checkins/checkouts, waar elk document een 'items'-array heeft met
    {material, weightKg, ...} per item)."""
    flat_items: list[dict] = []
    for doc in docs:
        flat_items.extend(doc.get(items_key) or [])
    return summarize_flat(flat_items, material_key=material_key, weight_key=weight_key)


def combine(*summaries: dict) -> dict:
    """Combineer meerdere summarize_*-resultaten tot één totaal."""
    combined = _empty_totals()
    for s in summaries:
        combined["totalWeightKg"] += s.get("totalWeightKg", 0)
        combined["totalCo2Kg"] += s.get("totalCo2Kg", 0)
        for category, bucket in s.get("byCategory", {}).items():
            target = combined["byCategory"].setdefault(
                category, {"weightKg": 0.0, "co2Kg": 0.0, "count": 0}
            )
            target["weightKg"] += bucket.get("weightKg", 0)
            target["co2Kg"] += bucket.get("co2Kg", 0)
            target["count"] += bucket.get("count", 0)

    combined["totalWeightKg"] = round(combined["totalWeightKg"], 2)
    combined["totalCo2Kg"] = round(combined["totalCo2Kg"], 2)
    for bucket in combined["byCategory"].values():
        bucket["weightKg"] = round(bucket["weightKg"], 2)
        bucket["co2Kg"] = round(bucket["co2Kg"], 2)
    return combined

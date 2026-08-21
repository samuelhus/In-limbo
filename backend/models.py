"""Pydantic models for In Limbo."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Literal
import uuid
from pydantic import BaseModel, Field, EmailStr, ConfigDict, model_validator


# ---------- Enums ----------
OrgCategory = Literal[
    "beeldende_kunsten",
    "jeugdwerk",
    "podiumkunsten",
    "noodopvang",
    "sociaal_werk",
    "sport",
    "educatie",
    "ander",
]

ListingMaterial = Literal[
    "Hout", "Metaal", "Plastic", "Steen", "Textiel",
    "Electro", "Vloeistof", "Papier", "Isolatie", "Ander",
]

UserStatus = Literal["pending", "validated", "rejected"]
UserRole = Literal["user", "admin", "donateur"]
OrgStatus = Literal["pending", "validated", "rejected", "active", "inactive"]
ListingStatus = Literal[
    "beschikbaar", "herbestemd", "in_magazijn", "gearchiveerd"
]


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- User ----------
class UserBase(BaseModel):
    email: EmailStr
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    phone: Optional[str] = None


class UserPublic(UserBase):
    id: str
    role: UserRole = "user"
    status: UserStatus = "pending"
    rejectionReason: Optional[str] = None
    organisationId: Optional[str] = None
    username: Optional[str] = None
    preferredLanguage: Literal["nl", "fr"] = "nl"
    dateLastLogin: Optional[str] = None
    createdAt: str


class UserInDB(UserPublic):
    passwordHash: str


# ---------- Organisation ----------
MAX_ORG_PHOTOS = 10


class OrgBase(BaseModel):
    name: str
    description: str
    category: OrgCategory
    address: Optional[str] = None
    website: Optional[str] = None
    photos: List[str] = Field(default_factory=list, max_length=MAX_ORG_PHOTOS)
    # Enkel door een admin instelbaar (zie AdminOrgUpdate) — niet via het
    # zelf-bedieningsformulier van de organisatie. Scholen die dit aanvinken
    # krijgen bij checkout de keuze 'student' (met e-mail) of 'bestaande
    # gebruiker' (zie routes/checkout.py + tasks.send_photo_reminders).
    studentCheckout: bool = False


class OrgPublic(OrgBase):
    id: str
    status: OrgStatus = "pending"
    rejectionReason: Optional[str] = None
    createdAt: str
    updatedAt: str


# ---------- Listing ----------
class ListingBase(BaseModel):
    title: str = Field(..., max_length=35)
    description: str = Field(..., max_length=400)
    weight: Optional[float] = Field(None, ge=0)  # gewicht PER STUK, niet totaal
    material: ListingMaterial
    quantity: int = Field(1, ge=1)  # totaal aantal beschikbare stuks
    photos: List[str] = Field(default_factory=list, max_length=5)
    technicalFiles: List[str] = Field(default_factory=list, max_length=3)
    deadline: Optional[str] = None  # ISO date string
    isRecurrent: bool = False
    dimensions: Optional[str] = None
    transport: Optional[str] = None


class ListingCreateBody(ListingBase):
    """Body for POST /api/listings. Admins may set placeInWarehouse=True."""
    placeInWarehouse: bool = False


class ListingPublic(ListingBase):
    id: str
    remainingQuantity: int = 0  # server-beheerd: quantity minus reeds toegewezen aantal
    status: ListingStatus = "beschikbaar"
    userId: str
    organisationId: str
    createdAt: str
    updatedAt: str


# ---------- Auth request bodies ----------
class RegisterNewOrg(BaseModel):
    """Registration where user creates a NEW organisation."""
    model_config = ConfigDict(str_strip_whitespace=True)
    # User
    email: EmailStr
    password: str = Field(..., min_length=8)
    firstName: str
    lastName: str
    phone: Optional[str] = None
    # Organisation
    orgName: str
    orgDescription: str
    orgCategory: OrgCategory
    orgAddress: Optional[str] = None
    orgWebsite: Optional[str] = None
    orgVisibleOnPartnerPage: bool = True
    acceptedTerms: bool
    preferredLanguage: Literal["nl", "fr"] = "nl"


class RegisterExistingOrg(BaseModel):
    """Registration where user joins an EXISTING (validated) organisation."""
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr
    password: str = Field(..., min_length=8)
    firstName: str
    lastName: str
    phone: Optional[str] = None
    organisationId: str
    acceptedTerms: bool
    preferredLanguage: Literal["nl", "fr"] = "nl"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    token: str
    newPassword: str = Field(..., min_length=8)


class RegisterDonateur(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    # Username is enkel het publieke identificatiemiddel voor een particuliere
    # donateur (die geen bedrijfsnaam heeft om zich mee te tonen bij een
    # aanbieding) — voor een bedrijfs-donateur wordt companyName daarvoor
    # gebruikt, dus daar is username niet verplicht.
    username: Optional[str] = None
    email: EmailStr
    password: str = Field(..., min_length=8)
    firstName: str = Field(..., min_length=1, max_length=100)
    donorType: Literal["particulier", "bedrijf"]
    companyName: Optional[str] = Field(None, max_length=150)
    acceptedTerms: bool
    preferredLanguage: Literal["nl", "fr"] = "nl"

    @model_validator(mode="after")
    def _validate_by_donor_type(self):
        if self.donorType == "bedrijf":
            if not (self.companyName and self.companyName.strip()):
                raise ValueError("Bedrijfsnaam is verplicht wanneer donorType 'bedrijf' is")
        else:
            if not (self.username and self.username.strip()):
                raise ValueError("Username is verplicht voor particuliere donateurs")
        return self


class AdminDecision(BaseModel):
    decision: Literal["approve", "reject"]
    rejectionReason: Optional[str] = None


# ---------- Applications ----------
ApplicationStatus = Literal["open", "selected", "not_selected", "withdrawn"]


class ApplicationCreate(BaseModel):
    motivation: str = Field(..., max_length=500, min_length=1)
    requestedQuantity: int = Field(1, ge=1)


class SelectApplicantBody(BaseModel):
    applicationId: str
    quantity: Optional[int] = Field(None, ge=1)  # None = ken toe wat gevraagd werd


# ---------- Conversations & Messages ----------
# Direct messaging tussen aanbieder en aanvrager van een listing — 1-op-1
# gekoppeld aan een Application (zie PRD_direct_messaging.md). Fase 1:
# datamodel + kernroutes. Fase 2: bijlagen bij berichten, met een
# cumulatieve limiet per Conversation i.p.v. per bericht (PRD §6.2). Fase 3
# (dit): blokkeren en verwijderen/archiveren per gesprek (PRD §6.4/§6.5).
#
# offererUserId wordt bij aanmaak van het gesprek als momentopname op het
# Conversation-document opgeslagen (uit Listing.userId, zie
# routes/conversations.py::create_conversation). Vroeger werd dit veld
# bewust NIET opgeslagen en steeds live afgeleid uit de listing, maar een
# aanbieding kan hard verwijderd worden (routes/listings.py::delete_listing)
# terwijl het gesprek als berichtenhistoriek blijft bestaan — zonder een
# opgeslagen kopie werd de aanbiederidentiteit dan onherstelbaar onbekend,
# waardoor niemand het gesprek nog kon inkijken of verwijderen. Voor
# gesprekken van vóór deze wijziging (veld ontbreekt) valt
# routes/conversations.py::_get_or_backfill_offerer_id terug op de listing
# (indien nog aanwezig) of anders op de afzender van het eerste bericht.
#
# blockedBy/hiddenBy zijn op het Mongo-document beide simpele arrays van
# userId's — X in blockedBy betekent "X heeft de andere partij geblokkeerd
# in dit gesprek", X in hiddenBy betekent "X heeft dit gesprek bij zichzelf
# verwijderd/verborgen" (zie routes/conversations.py). Beide zijn intern:
# ConversationPublic toont enkel de per-viewer afgeleide booleans hieronder,
# nooit de ruwe arrays (de andere partij hoeft niet te weten wélke ids
# precies blokkeren/verbergen).

# Cumulatieve bijlage-limiet per Conversation (PRD §6.2) — niet per bericht:
# max 5 foto's/bestanden en max 20 MB, samengeteld over alle berichten in
# dat gesprek. Bij overschrijding weigert de server het volledige bericht
# (zie routes/conversations.py::send_message).
MAX_CONVERSATION_ATTACHMENTS = 5
MAX_CONVERSATION_ATTACHMENT_BYTES = 20 * 1024 * 1024  # 20 MB


class MessageAttachment(BaseModel):
    """Eén foto of bestand bij een bericht.

    De bestaande upload-infra (zie frontend/src/lib/cloudinary.js) uploadt
    rechtstreeks van browser naar Cloudinary via een door de backend
    ondertekende signature — de backend krijgt achteraf enkel de
    resulterende URL te zien, nooit de bytes zelf. Om de cumulatieve
    limiet hieronder te kunnen afdwingen zonder een extra Cloudinary
    Admin-API-call (= nieuwe infra) te introduceren, geeft de client de
    grootte mee die Cloudinary's eigen uploadresponse al teruggeeft
    (`data.bytes`). Dat is hetzelfde vertrouwensniveau als de rest van de
    upload-infrastructuur, die URL's ook zonder server-side verificatie
    aanvaardt (zie o.a. Listing.photos/technicalFiles) — het aanvaarde
    risico hierrond staat in PRD §12.
    """
    url: str = Field(..., min_length=1)
    bytes: int = Field(..., gt=0, le=MAX_CONVERSATION_ATTACHMENT_BYTES)


class ConversationCreate(BaseModel):
    applicationId: str


class ConversationPublic(BaseModel):
    id: str
    applicationId: str
    listingId: str
    requesterUserId: str
    offererUserId: Optional[str] = None  # None enkel in het randgeval hierboven (geen listing én geen berichten)
    createdAt: str
    lastMessageAt: Optional[str] = None
    lastMessagePreview: Optional[str] = None
    attachmentCount: int = 0  # max MAX_CONVERSATION_ATTACHMENTS
    attachmentBytes: int = 0  # max MAX_CONVERSATION_ATTACHMENT_BYTES
    # Per-viewer afgeleid (zie routes/conversations.py::_serialize_conversation),
    # niet letterlijk zo opgeslagen — zie blockedBy/hiddenBy hierboven.
    blockedByMe: bool = False
    blockedByOther: bool = False
    hiddenByMe: bool = False


class MessageCreate(BaseModel):
    text: str = Field(..., max_length=2000, min_length=1)
    # max_length hier is een goedkope per-bericht sanity-bound; de echte
    # grens is cumulatief op Conversation-niveau, zie send_message.
    photos: List[MessageAttachment] = Field(default_factory=list, max_length=MAX_CONVERSATION_ATTACHMENTS)
    files: List[MessageAttachment] = Field(default_factory=list, max_length=MAX_CONVERSATION_ATTACHMENTS)


class MessagePublic(BaseModel):
    id: str
    conversationId: str
    senderId: str
    text: str
    photos: List[MessageAttachment] = Field(default_factory=list)
    files: List[MessageAttachment] = Field(default_factory=list)
    createdAt: str
    readAt: Optional[str] = None


# ---------- Update bodies ----------
class UserUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)
    username: Optional[str] = None
    preferredLanguage: Optional[Literal["nl", "fr"]] = None
    # Enkel relevant voor donateur-accounts. Bestaande donateurs (van vóór
    # deze feature) vullen dit vrijwillig aan via hun profiel — vandaar
    # optioneel, i.t.t. bij nieuwe registraties waar het verplicht is.
    donorType: Optional[Literal["particulier", "bedrijf"]] = None
    companyName: Optional[str] = Field(None, max_length=150)


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[OrgCategory] = None
    address: Optional[str] = None
    website: Optional[str] = None
    photos: Optional[List[str]] = Field(None, max_length=MAX_ORG_PHOTOS)


class ListingUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: Optional[str] = Field(None, max_length=35)
    description: Optional[str] = Field(None, max_length=400)
    weight: Optional[float] = Field(None, ge=0)
    material: Optional[ListingMaterial] = None
    quantity: Optional[int] = Field(None, ge=1)
    photos: Optional[List[str]] = None
    technicalFiles: Optional[List[str]] = None
    dimensions: Optional[str] = None
    transport: Optional[str] = None
    deadline: Optional[str] = None
    isRecurrent: Optional[bool] = None
    placeInWarehouse: Optional[bool] = None


# ---------- News / Inspiratie ----------
# "nieuws" = tijdsgebonden content (1 taal + taal-tag), "inspiratie" = tijdloze content (NL+FR)
PostType = Literal['nieuws', 'inspiratie']
NieuwsCategory = Literal['nieuws', 'helpende_handen', 'opleiding', 'giveaway']
InspiratieCategory = Literal['artikel', 'partner_project', 'documentatie']
PostLanguage = Literal['nl', 'fr']

NIEUWS_CATEGORIES = {'nieuws', 'helpende_handen', 'opleiding', 'giveaway'}
INSPIRATIE_CATEGORIES = {'artikel', 'partner_project', 'documentatie'}
INSPIRATIE_GALLERY_CATEGORIES = {'artikel', 'partner_project', 'documentatie'}
MAX_GALLERY_PHOTOS = 10
# Categorieën die een evenement beschrijven (helpende handen, giveaway,
# opleiding) hebben een verplichte evenementdatum, die op de site prominent
# getoond wordt i.p.v. de publicatiedatum.
EVENT_DATE_CATEGORIES = {'helpende_handen', 'giveaway', 'opleiding'}


class NewsPostBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    postType: PostType
    category: str

    # ---- nieuws: gekozen taal/talen (checkbox NL en/of FR) ----
    languages: Optional[List[PostLanguage]] = None
    photo: Optional[str] = None

    # ---- nieuws, enkel categorieën in EVENT_DATE_CATEGORIES: datum van het
    # evenement zelf (ISO-datum "YYYY-MM-DD"), i.p.v. de publicatiedatum ----
    eventDate: Optional[str] = None

    # ---- gedeeld: titel/inhoud per taal ----
    # nieuws: enkel de gekozen taal/talen (uit 'languages') verplicht in te vullen
    # inspiratie: altijd beide talen verplicht
    titleNl: Optional[str] = Field(None, max_length=100)
    titleFr: Optional[str] = Field(None, max_length=100)
    contentNl: Optional[str] = Field(None, max_length=20000)
    contentFr: Optional[str] = Field(None, max_length=20000)

    # ---- inspiratie-only fields ----
    photos: Optional[List[str]] = Field(default=None, max_length=MAX_GALLERY_PHOTOS)
    link: Optional[str] = None
    # Lijst van tag-ID's (verwijzen naar de aparte 'tags'-collectie). Enkel
    # relevant voor inspiratie-posts — bij nieuws-posts blijft dit gewoon
    # leeg/genegeerd. Geen limiet op aantal (zie afspraak met Samuel).
    tags: Optional[List[str]] = None

    @model_validator(mode='after')
    def _validate_by_type(self):
        if self.postType == 'nieuws':
            if self.category not in NIEUWS_CATEGORIES:
                raise ValueError(f"Ongeldige categorie voor nieuws: {self.category}")
            if not self.languages:
                raise ValueError("Kies minstens één taal (NL en/of FR)")
            if set(self.languages) - {'nl', 'fr'}:
                raise ValueError("Ongeldige taal opgegeven")
            if 'nl' in self.languages and (not self.titleNl or not self.contentNl):
                raise ValueError("Titel en inhoud in NL zijn verplicht wanneer NL is aangevinkt")
            if 'fr' in self.languages and (not self.titleFr or not self.contentFr):
                raise ValueError("Titel en inhoud in FR zijn verplicht wanneer FR is aangevinkt")
            if self.category in EVENT_DATE_CATEGORIES and not self.eventDate:
                raise ValueError("Datum van het evenement is verplicht voor deze categorie")
            if self.photos and len(self.photos) > MAX_GALLERY_PHOTOS:
                raise ValueError(f"Maximaal {MAX_GALLERY_PHOTOS} foto's toegelaten")
        else:
            if self.category not in INSPIRATIE_CATEGORIES:
                raise ValueError(f"Ongeldige categorie voor inspiratie: {self.category}")
            if not self.titleNl or not self.titleFr:
                raise ValueError("Titel in NL en FR is verplicht voor inspiratie")
            if not self.contentNl or not self.contentFr:
                raise ValueError("Inhoud in NL en FR is verplicht voor inspiratie")
            if self.photos and len(self.photos) > MAX_GALLERY_PHOTOS:
                raise ValueError(f"Maximaal {MAX_GALLERY_PHOTOS} foto's toegelaten")
        return self


class NewsPostCreate(NewsPostBase):
    pass


class NewsPostUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    postType: Optional[PostType] = None
    category: Optional[str] = None
    languages: Optional[List[PostLanguage]] = None
    photo: Optional[str] = None
    eventDate: Optional[str] = None
    titleNl: Optional[str] = Field(None, max_length=100)
    titleFr: Optional[str] = Field(None, max_length=100)
    contentNl: Optional[str] = Field(None, max_length=20000)
    contentFr: Optional[str] = Field(None, max_length=20000)
    photos: Optional[List[str]] = Field(default=None, max_length=MAX_GALLERY_PHOTOS)
    link: Optional[str] = None
    tags: Optional[List[str]] = None


class NewsPostPublic(NewsPostBase):
    id: str
    authorId: str
    createdAt: str
    updatedAt: str


# ---------- Magazijn checkout ----------
class CheckoutItem(BaseModel):
    material: str
    weightKg: float = Field(..., gt=0)


class CheckoutCreate(BaseModel):
    organisationId: str
    items: List[CheckoutItem] = Field(..., min_length=1)
    # Enkel relevant/toegelaten wanneer de gekozen organisatie studentCheckout
    # heeft aanstaan (zie routes/checkout.py, dat dit ook serverzijdig checkt).
    checkoutBy: Optional[Literal["student", "user"]] = None
    studentEmail: Optional[EmailStr] = None
    pickedUserId: Optional[str] = None

    @model_validator(mode="after")
    def _validate_checkout_by(self):
        if self.checkoutBy == "student" and not self.studentEmail:
            raise ValueError("E-mailadres van de student is verplicht")
        if self.checkoutBy == "user" and not self.pickedUserId:
            raise ValueError("Kies een bestaande gebruiker")
        return self


# ---------- Magazijn checkin ----------
class CheckinItem(BaseModel):
    material: str
    weightKg: float = Field(..., gt=0)
    description: Optional[str] = Field(None, max_length=200)


class CheckinCreate(BaseModel):
    # Een checkin komt binnen namens ofwel een organisatie, ofwel een
    # bedrijfs-donateur (particuliere donateurs brengen geen materiaal naar
    # het magazijn) — exact één van beide moet ingevuld zijn.
    organisationId: Optional[str] = None
    donateurUserId: Optional[str] = None
    items: List[CheckinItem] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _validate_target(self):
        if bool(self.organisationId) == bool(self.donateurUserId):
            raise ValueError("Kies exact één doel voor de checkin: organisatie of donateur")
        return self


# ---------- Notifications ----------
NotificationType = Literal[
    'new_application',
    'selected_as_receiver',
    'deadline_expired',
    'application_withdrawn',
    'unrehomed',
    'account_validated',
]


class EmailPreferences(BaseModel):
    new_application: bool = True
    selected_as_receiver: bool = True
    deadline_expired: bool = True
    application_withdrawn: bool = True
    unrehomed: bool = True
    account_validated: bool = True


class EmailPreferencesUpdate(BaseModel):
    new_application: Optional[bool] = None
    selected_as_receiver: Optional[bool] = None
    deadline_expired: Optional[bool] = None
    application_withdrawn: Optional[bool] = None
    unrehomed: Optional[bool] = None
    account_validated: Optional[bool] = None


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[Literal["user", "admin", "donateur"]] = None
    status: Optional[Literal["pending", "validated", "rejected"]] = None
    preferredLanguage: Optional[Literal["nl", "fr"]] = None


# ---------- Contact / Newsletter ----------
class ContactMessageCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    message: str = Field(..., min_length=1, max_length=1000)
    # Honeypot: verborgen veld in de UI. Mensen laten dit leeg; spambots
    # vullen het vaak automatisch in. Niet als spam-signaal naar de client
    # communiceren — gewoon stilletjes negeren in de route.
    website: Optional[str] = None


class NewsletterSubscribeCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr


class AdminOrgUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    status: Optional[Literal["pending", "validated", "active", "inactive", "rejected"]] = None
    photos: Optional[List[str]] = Field(None, max_length=MAX_ORG_PHOTOS)
    studentCheckout: Optional[bool] = None
    slug: Optional[str] = None


# ---------- Zoekertjes (search_requests) ----------
import json as _json
import os as _os

_CATEGORIES_PATH = _os.path.join(_os.path.dirname(__file__), "material_categories.json")
with open(_CATEGORIES_PATH, "r", encoding="utf-8") as _f:
    MATERIAL_CATEGORIES: list[dict] = _json.load(_f)

# hoofdcategorie-sleutel -> set van geldige (sub)categorie-sleutels, waarbij de
# hoofdcategorie zelf ook een geldige "subcategorie"-keuze is (zie PRD §4 stap 2)
MATERIAL_SUBCATEGORY_MAP: dict[str, set[str]] = {
    c["key"]: {c["key"]} | {s["key"] for s in c["subcategories"]}
    for c in MATERIAL_CATEGORIES
}
MATERIAL_MAIN_CATEGORY_KEYS: set[str] = set(MATERIAL_SUBCATEGORY_MAP.keys())

SearchRequestProjectType = Literal[
    "verbouwing", "workshop", "kunst", "scenografie", "voorstelling", "infrastructuur", "ander",
]
SEARCH_REQUEST_PROJECT_TYPES = {
    "verbouwing", "workshop", "kunst", "scenografie", "voorstelling", "infrastructuur", "ander",
}
SearchRequestStatus = Literal["actief", "verlopen"]


class SearchRequestMaterialItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    hoofdcategorie: str
    subcategorie: str
    opmerking: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def _validate_categories(self):
        if self.hoofdcategorie not in MATERIAL_MAIN_CATEGORY_KEYS:
            raise ValueError(f"Onbekende hoofdcategorie: {self.hoofdcategorie}")
        valid_subs = MATERIAL_SUBCATEGORY_MAP[self.hoofdcategorie]
        if self.subcategorie not in valid_subs:
            raise ValueError(f"Ongeldige subcategorie '{self.subcategorie}' voor hoofdcategorie '{self.hoofdcategorie}'")
        return self


class SearchRequestBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    projectName: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=200)
    projectType: Optional[SearchRequestProjectType] = None
    shortDescription: Optional[str] = Field(None, max_length=500)
    deadline: Optional[str] = None  # ISO-datum
    photos: List[str] = Field(default_factory=list, max_length=5)
    materials: List[SearchRequestMaterialItem] = Field(default_factory=list)


class SearchRequestCreateBody(SearchRequestBase):
    """Body for POST /api/search-requests (gevalideerde gebruiker).
    Server valideert de user-verplichte velden na ontvangst (zie route),
    zodat dezelfde body-vorm ook voor de admin-variant hergebruikt kan worden."""
    pass


class SearchRequestAdminCreateBody(SearchRequestBase):
    """Body for POST /api/admin/search-requests (admin, namens een organisatie/gebruiker).
    Geen enkel veld is technisch verplicht — zie PRD §5."""
    organisationId: str
    createdByUserId: Optional[str] = None


class SearchRequestUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    projectName: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=200)
    projectType: Optional[SearchRequestProjectType] = None
    shortDescription: Optional[str] = Field(None, max_length=500)
    deadline: Optional[str] = None
    photos: Optional[List[str]] = Field(None, max_length=5)
    materials: Optional[List[SearchRequestMaterialItem]] = None
    closed: Optional[bool] = None  # gebruiker sluit het zoekertje handmatig af (§5)


# ---------- Inspiratie-tags ----------
# Losstaande, herbruikbare tags voor inspiratie-posts (bv. "Spel"/"Jeu",
# "Hergebruik"/"Réemploi"). Elke tag heeft verplicht een NL- en FR-naam.
# Posts verwijzen enkel naar het tag-ID (zie NewsPostBase.tags) — zo werkt
# een hernoem/verwijder door de admin automatisch overal door, zonder
# verouderde gekopieerde tekst in elke post.
class TagCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    nameNl: str = Field(..., min_length=1, max_length=50)
    nameFr: str = Field(..., min_length=1, max_length=50)


class TagUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    nameNl: Optional[str] = Field(None, min_length=1, max_length=50)
    nameFr: Optional[str] = Field(None, min_length=1, max_length=50)


# ---------- Schat of Schroot? (swipe-spel, zie prd/PRD_Schat_of_Schroot.md) ----------
# Volledig losstaand subsysteem: eigen account-systeem (game_users, niet gelinkt
# aan `users`), eigen auth (zie game_auth.py — apart JWT-secret/cookie), eigen
# collecties (game_users/game_interactions/game_evaluations). Enkel `listings`
# krijgt er 3 optionele velden bij (gameEnabled/gameEvaluationCount/gameValidation,
# zie routes/game.py en routes/admin_game.py) — verder geen koppeling met de rest
# van het platform-datamodel.
GameSwipeDirection = Literal["left", "right"]
GameInteractionType = Literal["reject", "evaluate"]

# Cap op het aantal evaluaties per listing (PRD §4.2 punt 7 / §8.5) — zodra bereikt
# valt de listing automatisch uit de random-selectiepool (routes/game.py::get_series).
MAX_GAME_EVALUATIONS_PER_LISTING = 20

# Statusset die de spelpool afbakent — bevestigd met product: dezelfde statussen als
# de publieke catalogus (routes/listings.py, GET /listings), niet enkel gearchiveerde
# listings. Herbruikt in routes/game.py (pool-query) en routes/admin_game.py (stats).
GAME_POOL_STATUSES = ["beschikbaar", "in_magazijn"]


class GameRegisterBody(BaseModel):
    """Body for POST /api/game/register. Nieuwe username -> account; bestaande
    username + matchend email -> login; bestaande username + ander email -> 409
    (zie routes/game.py). Geen wachtwoord — email fungeert als toegangssleutel
    (PRD §3, bewust aanvaard zwak-authenticatierisico)."""
    model_config = ConfigDict(str_strip_whitespace=True)
    username: str = Field(..., min_length=2, max_length=30)
    email: EmailStr
    # GDPR-consent (PRD §3) — het techdesign had hiervoor geen veld voorzien;
    # toegevoegd zodat consent effectief afgedwongen én bewaard wordt
    # (game_users.consentAt), niet enkel een UI-checkbox zonder gevolg.
    consentAccepted: bool = False


class GameSwipeBody(BaseModel):
    listingId: str
    direction: GameSwipeDirection


class GameEvaluateBody(BaseModel):
    """PRD §4.2 stap 2-3: beide antwoorden verplicht, geen lege velden."""
    model_config = ConfigDict(str_strip_whitespace=True)
    listingId: str
    answer1: str = Field(..., min_length=1, max_length=500)  # "Wat kan je ermee doen?"
    answer2: str = Field(..., min_length=1, max_length=500)  # "Wie kan dit gebruiken?"


class GameChooseBestBody(BaseModel):
    listingId: str
    evaluationId: str


class GameModerateBody(BaseModel):
    hidden: bool


class GameListingExcludeBody(BaseModel):
    gameEnabled: bool


class GameValidateBody(BaseModel):
    destinationOrgId: str



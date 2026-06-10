"""Pydantic models for In Limbo."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Literal
import uuid
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# ---------- Enums ----------
OrgCategory = Literal[
    "Beeldende kunsten",
    "Jeugdwerk",
    "Podiumkunsten",
    "Squat",
    "Sociaal werk",
    "Sport",
    "Educatie",
    "Ander",
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
    dateLastLogin: Optional[str] = None
    createdAt: str


class UserInDB(UserPublic):
    passwordHash: str


# ---------- Organisation ----------
class OrgBase(BaseModel):
    name: str
    description: str
    category: OrgCategory
    address: Optional[str] = None
    website: Optional[str] = None
    photos: List[str] = Field(default_factory=list)


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
    weight: Optional[float] = Field(None, ge=0)
    material: ListingMaterial
    photos: List[str] = Field(default_factory=list, max_length=5)
    deadline: Optional[str] = None  # ISO date string
    isRecurrent: bool = False
    dimensions: Optional[str] = None
    transport: Optional[str] = None


class ListingCreateBody(ListingBase):
    """Body for POST /api/listings. Admins may set placeInWarehouse=True."""
    placeInWarehouse: bool = False


class ListingPublic(ListingBase):
    id: str
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
    password: str = Field(..., min_length=6)
    firstName: str
    lastName: str
    phone: Optional[str] = None
    # Organisation
    orgName: str
    orgDescription: str
    orgCategory: OrgCategory
    orgAddress: Optional[str] = None
    orgWebsite: Optional[str] = None
    acceptedTerms: bool


class RegisterExistingOrg(BaseModel):
    """Registration where user joins an EXISTING (validated) organisation."""
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr
    password: str = Field(..., min_length=6)
    firstName: str
    lastName: str
    phone: Optional[str] = None
    organisationId: str
    acceptedTerms: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    token: str
    newPassword: str = Field(..., min_length=6)


class RegisterDonateur(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    username: str
    email: EmailStr
    password: str = Field(..., min_length=6)
    acceptedTerms: bool


class AdminDecision(BaseModel):
    decision: Literal["approve", "reject"]
    rejectionReason: Optional[str] = None


# ---------- Applications ----------
ApplicationStatus = Literal["open", "selected", "not_selected", "withdrawn"]


class ApplicationCreate(BaseModel):
    motivation: str = Field(..., max_length=500, min_length=1)


class SelectApplicantBody(BaseModel):
    applicationId: str


# ---------- Update bodies ----------
class UserUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6)
    username: Optional[str] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[OrgCategory] = None
    address: Optional[str] = None
    website: Optional[str] = None
    photos: Optional[List[str]] = None


class ListingUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: Optional[str] = Field(None, max_length=35)
    description: Optional[str] = Field(None, max_length=400)
    weight: Optional[float] = Field(None, ge=0)
    material: Optional[ListingMaterial] = None
    photos: Optional[List[str]] = None
    dimensions: Optional[str] = None
    transport: Optional[str] = None
    deadline: Optional[str] = None
    isRecurrent: Optional[bool] = None
    placeInWarehouse: Optional[bool] = None


# ---------- News ----------
NewsCategory = Literal['evenement', 'artikel', 'giveaway', 'opleidingsmoment', 'oproep', 'ander']


class NewsPostBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(..., max_length=100)
    category: NewsCategory
    content: str = Field(..., max_length=5000)
    photo: Optional[str] = None


class NewsPostCreate(NewsPostBase):
    pass


class NewsPostUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: Optional[str] = Field(None, max_length=100)
    category: Optional[NewsCategory] = None
    content: Optional[str] = Field(None, max_length=5000)
    photo: Optional[str] = None


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


# ---------- Magazijn checkin ----------
class CheckinItem(BaseModel):
    material: str
    weightKg: float = Field(..., gt=0)
    description: Optional[str] = Field(None, max_length=200)


class CheckinCreate(BaseModel):
    organisationId: str
    items: List[CheckinItem] = Field(..., min_length=1)


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


class AdminOrgUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    status: Optional[Literal["pending", "validated", "active", "inactive", "rejected"]] = None

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
    "Squad",
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
UserRole = Literal["user", "admin"]
OrgStatus = Literal["pending", "validated", "rejected", "active", "inactive"]
ListingStatus = Literal[
    "beschikbaar", "in_afwachting", "herbestemd", "in_magazijn", "gearchiveerd"
]


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- User ----------
class UserBase(BaseModel):
    email: EmailStr
    firstName: str
    lastName: str
    phone: Optional[str] = None


class UserPublic(UserBase):
    id: str
    role: UserRole = "user"
    status: UserStatus = "pending"
    rejectionReason: Optional[str] = None
    organisationId: str
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
    weight: float = Field(..., gt=0)
    material: ListingMaterial
    photos: List[str] = Field(default_factory=list, max_length=5)
    deadline: Optional[str] = None  # ISO date string
    isRecurrent: bool = False
    dimensions: Optional[str] = None
    transport: Optional[str] = None


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


class AdminDecision(BaseModel):
    decision: Literal["approve", "reject"]
    rejectionReason: Optional[str] = None


# ---------- Update bodies ----------
class UserUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6)


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[OrgCategory] = None
    address: Optional[str] = None
    website: Optional[str] = None
    photos: Optional[List[str]] = None

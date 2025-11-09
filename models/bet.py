# bet.py

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Literal
from bson import ObjectId
from datetime import datetime
from enum import Enum
from models.base import PyObjectId, BaseModelWithTimestamps


class BetStatus(str, Enum):
    pending = "pending"
    won = "won"
    lost = "lost"
    canceled = "canceled"


class BetPlatform(str, Enum):
    web = "web"
    mobile = "mobile"
    api = "api"
    unknown = "unknown"


class BetModel(BaseModelWithTimestamps):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    user_id: str = Field(..., description="User identifier (username or ObjectId as string)")
    amount: float = Field(..., gt=0, description="Amount placed on the bet")
    odds: float = Field(..., gt=0, description="Odds for the bet")
    status: BetStatus = Field(default=BetStatus.pending)
    event: Optional[str] = Field(None, description="Event name or ID")
    bet_time: datetime = Field(default_factory=datetime.utcnow)
    platform: BetPlatform = Field(default=BetPlatform.unknown)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    description: Optional[str] = Field(None, description="Optional notes about the bet")
    is_live: bool = Field(default=False)
    tags: Optional[List[str]] = Field(default_factory=list)
    verified: bool = Field(default=False)
    ip_address: Optional[str] = None

    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        schema_extra = {
            "example": {
                "user_id": "user1",
                "amount": 100.0,
                "odds": 2.5,
                "status": "pending",
                "event": "Champions League Final",
                "platform": "web",
                "currency": "USD",
                "description": "Bet placed for team A",
                "is_live": False,
                "tags": ["football", "live"],
                "verified": True,
                "ip_address": "192.168.0.1"
            }
        }


class CreateBetModel(BaseModel):
    user_id: str
    amount: float
    odds: float
    event: Optional[str]
    platform: Optional[BetPlatform] = BetPlatform.unknown
    currency: Optional[str] = "USD"
    description: Optional[str] = None
    is_live: Optional[bool] = False
    tags: Optional[List[str]] = []
    ip_address: Optional[str] = None

    @validator("amount", "odds")
    def must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount and Odds must be greater than 0")
        return v


class UpdateBetModel(BaseModel):
    status: Optional[BetStatus]
    amount: Optional[float]
    odds: Optional[float]
    verified: Optional[bool]
    is_live: Optional[bool]
    tags: Optional[List[str]]
    description: Optional[str]

    @validator("amount", "odds")
    def must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Amount and Odds must be greater than 0")
        return v


class BetResponseModel(BetModel):
    pass


class BetListResponse(BaseModel):
    bets: List[BetResponseModel]
    total: int
    page: int
    size: int

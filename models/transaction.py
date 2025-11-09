"""Transaction model for the BetPro Backend application.

This module provides the Transaction model class for wallet operations
and financial tracking.
"""
from datetime import datetime
from bson import ObjectId
from models.base import BaseModel

class Transaction(BaseModel):
    """Transaction model for wallet operations."""
    
    # Transaction types
    TYPE_CREDIT = 'credit'
    TYPE_DEBIT = 'debit'
    TYPE_BET = 'bet'
    TYPE_WIN = 'win'
    TYPE_LOSS = 'loss'
    TYPE_DEPOSIT = 'deposit'
    TYPE_WITHDRAWAL = 'withdrawal'
    TYPE_ADJUSTMENT = 'adjustment'
    TYPE_COMMISSION = 'commission'
    
    TYPES = [TYPE_CREDIT, TYPE_DEBIT, TYPE_BET, TYPE_WIN, TYPE_LOSS, 
             TYPE_DEPOSIT, TYPE_WITHDRAWAL, TYPE_ADJUSTMENT, TYPE_COMMISSION]
    
    # Transaction statuses
    STATUS_COMPLETED = 'completed'
    STATUS_PENDING = 'pending'
    STATUS_FAILED = 'failed'
    STATUS_REVERSED = 'reversed'
    
    def __init__(self, user_id, amount, transaction_type, description=None, 
                 previous_balance=None, new_balance=None, reference_id=None,
                 created_by=None, status='completed', username=None,
                 _id=None, created_at=None, updated_at=None):
        """Initialize a transaction object."""
        # Initialize the base model
        super().__init__(_id, created_at, updated_at)
        
        # Transaction specific attributes
        self.user_id = user_id
        self.username = username  # Store username for easier querying/display
        self.amount = float(amount)
        self.transaction_type = transaction_type
        self.description = description
        self.previous_balance = float(previous_balance) if previous_balance is not None else None
        self.new_balance = float(new_balance) if new_balance is not None else None
        self.reference_id = reference_id  # For linking to bets, deposits, etc.
        self.created_by = created_by  # User ID who created this transaction
        self.status = status  # completed, pending, failed, reversed
    
    def to_dict(self):
        """Convert transaction object to dictionary."""
        return {
            "_id": str(self._id),
            "user_id": str(self.user_id),
            "amount": self.amount,
            "transaction_type": self.transaction_type,
            "description": self.description,
            "previous_balance": self.previous_balance,
            "new_balance": self.new_balance,
            "reference_id": str(self.reference_id) if self.reference_id else None,
            "created_by": str(self.created_by) if self.created_by else None,
            "status": self.status,
            "timestamp": self.timestamp
        }
    
    @staticmethod
    def from_dict(data):
        """Create a transaction object from dictionary data."""
        return Transaction(
            _id=ObjectId(data.get("_id")) if data.get("_id") else None,
            user_id=ObjectId(data.get("user_id")) if data.get("user_id") else None,
            amount=data.get("amount"),
            transaction_type=data.get("transaction_type"),
            description=data.get("description"),
            previous_balance=data.get("previous_balance"),
            new_balance=data.get("new_balance"),
            reference_id=ObjectId(data.get("reference_id")) if data.get("reference_id") else None,
            created_by=ObjectId(data.get("created_by")) if data.get("created_by") else None,
            status=data.get("status", "completed"),
            timestamp=data.get("timestamp")
        )

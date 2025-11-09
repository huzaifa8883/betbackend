"""User model for the BetPro Backend application.

This module provides the User model class with role-based access control
and wallet functionality.
"""
from datetime import datetime
from bson import ObjectId
from models.base import BaseModel

class User(BaseModel):
    """User model with role-based access control and wallet functionality."""
    
    # Role definitions with hierarchical permissions
    ROLES = {
        'user': 0,       # Regular user - can place bets, view own data
        'master': 1,     # Master - can manage users
        'supermaster': 2, # Supermaster - can manage masters and users
        'admin': 3       # Admin - full system access
    }
    
    # Status definitions
    STATUS_ACTIVE = 'active'
    STATUS_SUSPENDED = 'suspended'
    STATUS_INACTIVE = 'inactive'
    
    def __init__(self, username, email, password_hash=None, role='user', 
                 full_name=None, phone=None, status='active', 
                 wallet_balance=0.0, last_login=None,
                 parent_id=None, children=None, transactions=None,
                 _id=None, created_at=None, updated_at=None):
        """Initialize a user object."""
        # Initialize the base model
        super().__init__(_id, created_at, updated_at)
        
        # User specific attributes
        self.username = username
        self.email = email
        self.password_hash = password_hash or ""  # Ensure password_hash is never None
        self.role = role
        self.full_name = full_name
        self.phone = phone
        self.status = status  # active, suspended, inactive
        self.wallet_balance = float(wallet_balance) if wallet_balance is not None else 0.0
        self.last_login = last_login
        self.parent_id = parent_id  # ID of the user who created this user (hierarchy)
        self.children = children or []  # List of user IDs created by this user
        self.transactions = transactions or []  # List of transaction IDs
    
    def to_dict(self):
        """Convert user object to dictionary."""
        return {
            "_id": str(self._id),
            "username": self.username,
            "email": self.email,
            "role": self.role,
            "full_name": self.full_name,
            "phone": self.phone,
            "status": self.status,
            "wallet_balance": self.wallet_balance,
            "created_at": self.created_at,
            "last_login": self.last_login,
            "parent_id": str(self.parent_id) if self.parent_id else None,
            "children_count": len(self.children),
            "transaction_count": len(self.transactions)
        }
    
    def to_safe_dict(self):
        """Convert user object to dictionary without sensitive information.
        Ensures a standardized format for all user objects regardless of when they were created.
        """
        # Create a standardized dictionary with all required fields
        standardized_dict = {
            "_id": str(self._id),
            "username": self.username,
            "email": self.email,
            "role": self.role,
            "full_name": self.full_name or "",
            "phone": self.phone or "",  # Standardized field name
            "status": self.status,
            "wallet_balance": float(self.wallet_balance) if self.wallet_balance is not None else 0.0,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "last_login": self.last_login,
            "parent_id": str(self.parent_id) if self.parent_id else None,
            "reference": "",  # Default empty reference
            "children_count": len(self.children),
            "transaction_count": len(self.transactions)
        }
        return standardized_dict
    
    @staticmethod
    def from_dict(data):
        """Create a user object from dictionary data."""
        if not data:
            raise ValueError("Cannot create User from empty data")
            
        if not data.get("username"):
            raise ValueError("Username is required")
            
        # Handle both password_hash and legacy password field
        password_hash = data.get("password_hash")
        if not password_hash and "password" in data:
            # If we have a legacy password field, use it as password_hash
            password_hash = data.get("password")
            
        # Handle ObjectId conversion safely
        _id = None
        if data.get("_id"):
            if isinstance(data["_id"], ObjectId):
                _id = data["_id"]
            else:
                try:
                    _id = ObjectId(data["_id"])
                except:
                    _id = data["_id"]  # Keep as is if not convertible
                    
        # Handle parent_id conversion safely
        parent_id = None
        if data.get("parent_id"):
            if isinstance(data["parent_id"], ObjectId):
                parent_id = data["parent_id"]
            else:
                try:
                    parent_id = ObjectId(data["parent_id"])
                except:
                    parent_id = data["parent_id"]
                    
        # Handle wallet balance safely
        try:
            wallet_balance = float(data.get("wallet_balance", 0.0))
        except (ValueError, TypeError):
            wallet_balance = 0.0
            
        return User(
            _id=_id,
            username=data.get("username"),
            email=data.get("email"),
            password_hash=password_hash,
            role=data.get("role", "user"),
            full_name=data.get("full_name"),
            phone=data.get("phone"),
            status=data.get("status", "active"),
            wallet_balance=wallet_balance,
            created_at=data.get("created_at"),
            last_login=data.get("last_login"),
            parent_id=parent_id,
            children=data.get("children", []),
            transactions=data.get("transactions", [])
        )
    
    def can_manage(self, other_user):
        """Check if this user can manage another user based on role hierarchy."""
        if not other_user:
            return False
            
        # Admin can manage everyone
        if self.role == 'admin':
            return True
            
        # Supermaster can manage masters and users
        if self.role == 'supermaster' and other_user.role in ['master', 'user']:
            return True
            
        # Master can manage only users
        if self.role == 'master' and other_user.role == 'user':
            return True
            
        # Users can't manage anyone
        return False
    
    def has_role_permission(self, required_role):
        """Check if user has permission for a specific role level."""
        return User.ROLES.get(self.role, 0) >= User.ROLES.get(required_role, 0)
        
    def add_transaction(self, transaction):
        """Add a transaction to the user's transaction history."""
        if not self.transactions:
            self.transactions = []
        self.transactions.append(transaction)
        
    def update_wallet_balance(self, amount, transaction_type, description=None):
        """Update user wallet balance and record the transaction."""
        previous_balance = self.wallet_balance
        
        if transaction_type == 'credit':
            self.wallet_balance += float(amount)
        elif transaction_type == 'debit':
            if self.wallet_balance < float(amount):
                return False, "Insufficient funds"
            self.wallet_balance -= float(amount)
        else:
            return False, "Invalid transaction type"
            
        # Create transaction record
        transaction = {
            "transaction_id": str(ObjectId()),
            "user_id": str(self._id),
            "amount": float(amount),
            "type": transaction_type,
            "previous_balance": previous_balance,
            "new_balance": self.wallet_balance,
            "description": description,
            "timestamp": datetime.utcnow()
        }
        
        self.add_transaction(transaction)
        return True, transaction

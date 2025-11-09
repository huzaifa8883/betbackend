"""User service for the BetPro Backend application.

This module provides the UserService class for handling user-related
operations and business logic.
"""
import logging
from datetime import datetime
from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from models.user import User
from models.transaction import Transaction
from services.base_service import BaseService
from utils.cache import session_cached, request_cached

# Singleton instance
_user_service_instance = None

class UserService(BaseService):
    """User service for handling user-related operations."""
    
    def __init__(self):
        """Initialize the user service."""
        # Use singleton pattern to prevent repeated initialization
        global _user_service_instance
        
        if _user_service_instance is not None:
            # Return existing instance's attributes
            self.__dict__ = _user_service_instance.__dict__
            return
            
        from database.db_config import COLLECTIONS
        super().__init__(COLLECTIONS['USERS'])  # Use standardized collection name from config
        self.transactions = self.db[COLLECTIONS['TRANSACTIONS']]
        self.logger = logging.getLogger('service.user')
        
        # Create indexes only once during initialization
        self._create_indexes()
        
        # Print users for debugging (will only happen once)
        self._debug_print_users()
        
        # Store singleton instance
        _user_service_instance = self
        
    def _create_indexes(self):
        """Create necessary indexes for the users collection."""
        try:
            # First, drop any existing conflicting indexes
            self._drop_conflicting_indexes()
            
            # Create indexes with explicit names to avoid conflicts
            self.collection.create_index([('username', 1)], unique=True, name='username_unique_idx', background=True)
            self.collection.create_index([('email', 1)], unique=True, sparse=True, name='email_unique_idx', background=True)
            self.collection.create_index([('role', 1)], name='role_idx', background=True)
            
            # Create indexes for transactions collection
            self.transactions.create_index([('user_id', 1)], name='user_id_idx', background=True)
            self.transactions.create_index([('created_at', -1)], name='created_at_idx', background=True)
            self.transactions.create_index([('transaction_type', 1)], name='transaction_type_idx', background=True)
            
            self.logger.debug("User service indexes created or verified")
        except Exception as e:
            self.logger.warning(f"Error creating indexes: {str(e)}")
    
    def _drop_conflicting_indexes(self):
        """Drop any existing indexes that might conflict with our new ones."""
        try:
            # Get existing indexes
            existing_indexes = self.collection.index_information()
            
            # List of auto-generated index names that might conflict with our explicit names
            conflicting_names = ['username_1', 'email_1']
            
            # Drop conflicting indexes
            for idx_name in conflicting_names:
                if idx_name in existing_indexes:
                    self.logger.info(f"Dropping conflicting index: {idx_name}")
                    try:
                        self.collection.drop_index(idx_name)
                    except Exception as e:
                        self.logger.warning(f"Could not drop index {idx_name}: {str(e)}")
                        
            # Same for transactions collection
            existing_txn_indexes = self.transactions.index_information()
            conflicting_txn_names = ['user_id_1', 'created_at_-1', 'transaction_type_1']
            
            for idx_name in conflicting_txn_names:
                if idx_name in existing_txn_indexes:
                    self.logger.info(f"Dropping conflicting transaction index: {idx_name}")
                    try:
                        self.transactions.drop_index(idx_name)
                    except Exception as e:
                        self.logger.warning(f"Could not drop transaction index {idx_name}: {str(e)}")
        except Exception as e:
            self.logger.warning(f"Error checking/dropping indexes: {str(e)}")
    
    def _debug_print_users(self):
        """Print users for debugging purposes."""
        try:
            users = self.find_many({}, limit=10)
            self.logger.info(f"Found {len(users)} users in users collection")
            
            # Print first few users for debugging
            for i, user in enumerate(users[:5], 1):
                self.logger.info(f"MongoDB User {i}: {user.get('username')} (role: {user.get('role')})")
        except Exception as e:
            self.logger.error(f"Error printing users: {str(e)}")
        
    def authenticate(self, username, password):
        """Authenticate a user with username and password.
        
        Args:
            username: The username to authenticate
            password: The password to verify
            
        Returns:
            Tuple of (User, None) if authentication successful, or (None, error_message) if failed
        """
        try:
            self.logger.debug(f"Authenticating user: {username}")
            user_data = self.find_one({"username": username})
            
            if not user_data:
                self.logger.warning(f"Authentication failed: User {username} not found")
                return None, "Invalid username or password"
            
            # Debug log to see what fields are in the user document
            self.logger.debug(f"User data keys: {list(user_data.keys())}")
            
            # Check if we have a password field directly (legacy) or password_hash
            auth_success = False
            
            # Case 1: Direct password comparison (legacy)
            if 'password' in user_data:
                if user_data['password'] == password:
                    self.logger.info(f"Legacy password authentication successful for user: {username}")
                    auth_success = True
            
            # Case 2: Hashed password comparison
            elif 'password_hash' in user_data and user_data['password_hash']:
                try:
                    if check_password_hash(user_data['password_hash'], password):
                        self.logger.info(f"Hashed password authentication successful for user: {username}")
                        auth_success = True
                except Exception as e:
                    self.logger.error(f"Error checking password hash: {e}")
            
            if not auth_success:
                self.logger.warning(f"Authentication failed: Invalid password for user: {username}")
                return None, "Invalid username or password"
                
            # Check if account is active - only if status field exists
            if 'status' in user_data and user_data.get('status') != 'active' and user_data.get('status') is not None:
                self.logger.warning(f"Authentication failed: Account {username} is not active")
                return None, "Account is not active"
                
            # Update last login time
            self.update_by_id(user_data['_id'], {
                "last_login": datetime.utcnow()
            })
            
            # Create user object from data
            try:
                user = User.from_dict(user_data)
                self.logger.info(f"Authentication successful for user: {username} (role: {user.role})")
                return user, None
            except Exception as e:
                self.logger.error(f"Error creating User object from data: {e}")
                return None, f"Error processing user data: {str(e)}"
                
        except Exception as e:
            self.logger.error(f"Error authenticating user {username}: {e}")
            return None, f"Authentication error: {str(e)}"
            
    def create_admin_user_if_not_exists(self):
        """Create an admin user if one doesn't exist or update if it exists with invalid credentials.
        
        This method is called during application startup to ensure
        there's always at least one admin user in the system with valid credentials.
        """
        try:
            # Check if admin user exists
            admin_user = self.find_one({"username": "admin"})
            admin_password = "12345678"  # Default admin password
            
            if not admin_user:
                self.logger.info("Admin user not found. Creating default admin user...")
                
                # Create admin user with both password_hash and legacy password field
                admin_data = {
                    "username": "admin",
                    "email": "admin@betpro.com",
                    "password_hash": generate_password_hash(admin_password),
                    "password": admin_password,  # Legacy field for backward compatibility
                    "role": "admin",
                    "status": "active",
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                
                result = self.collection.insert_one(admin_data)
                
                if result.inserted_id:
                    self.logger.info(f"Default admin user created with ID: {result.inserted_id}")
                    return True
                else:
                    self.logger.error("Failed to create default admin user")
                    return False
            else:
                self.logger.debug("Admin user exists, ensuring credentials are valid...")
                
                # Check if we need to update the admin user's credentials
                needs_update = False
                update_data = {}
                
                # Ensure password_hash exists and is valid
                if 'password_hash' not in admin_user or not admin_user['password_hash']:
                    update_data['password_hash'] = generate_password_hash(admin_password)
                    needs_update = True
                    self.logger.debug("Adding missing password_hash field to admin user")
                
                # Ensure legacy password field exists for backward compatibility
                if 'password' not in admin_user:
                    update_data['password'] = admin_password
                    needs_update = True
                    self.logger.debug("Adding legacy password field to admin user")
                
                if needs_update:
                    self.logger.debug("Updating admin user credentials...")
                    update_data['updated_at'] = datetime.utcnow()
                    
                    result = self.collection.update_one(
                        {"_id": admin_user["_id"]},
                        {"$set": update_data}
                    )
                    
                    if result.modified_count > 0:
                        self.logger.debug("Admin user credentials updated successfully")
                    else:
                        self.logger.debug("Admin user found but credentials not updated")
                else:
                    self.logger.debug("Admin user credentials are valid")
                
                return True
                
        except Exception as e:
            self.logger.error(f"Error managing admin user: {e}")
            return False
    
    def create_user(self, username, email, password, role='user', 
               full_name=None, phone=None, parent_id=None, initial_balance=0.0):
        """Create a new user."""
        try:
            # Check if username or email already exists
            if self.find_one({"username": username}):
                return None, "Username already exists"
            
            if self.find_one({"email": email}):
                return None, "Email already exists"
            
            # Hash the password
            password_hash = generate_password_hash(password)
            
            # Create the user object
            user = User(
                username=username,
                email=email,
                password_hash=password_hash,
                role=role,
                full_name=full_name,
                phone=phone,
                parent_id=parent_id,
                wallet_balance=initial_balance
            )
            
            # Insert the user into the database
            user_dict = user.to_dict()
            user_id = self.insert_one(user_dict)
            
            if user_id:
                # Update parent's children list if parent_id is provided
                if parent_id:
                    self.update_by_id(parent_id, {
                        "$push": {"children": str(user_id)}
                    })
                
                # Create initial balance transaction if needed
                if initial_balance > 0:
                    transaction = Transaction(
                        user_id=user_id,
                        username=username,
                        amount=initial_balance,
                        transaction_type="credit",
                        description="Initial balance",
                        previous_balance=0,
                        new_balance=initial_balance,
                        created_by=parent_id
                    )
                    
                    # Insert transaction
                    transaction_dict = transaction.to_dict()
                    self.transactions.insert_one(transaction_dict)
                
                return user_id, None
            else:
                return None, "Failed to create user"
        except Exception as e:
            self.logger.error(f"Error creating user: {e}")
            return None, str(e)
    
    def authenticate(self, username, password):
        """Authenticate a user with username and password."""
        try:
            # Find the user by username
            user_data = self.find_one({"username": username})
            
            if not user_data:
                return None, "Invalid username or password"
            
            # Check if the password is correct
            if not check_password_hash(user_data['password_hash'], password):
                return None, "Invalid username or password"
            
            # Check if the user is active
            if user_data.get('status') != 'active':
                return None, "Account is not active"
            
            # Update last login time
            self.update_by_id(user_data['_id'], {
                "last_login": datetime.utcnow()
            })
            
            # Create a User object
            user = User.from_dict(user_data)
            
            return user, None
        except Exception as e:
            self.logger.error(f"Error authenticating user: {e}")
            return None, str(e)
    
    def get_user_by_id(self, user_id):
        """Get a user by ID."""
        try:
            user_data = self.find_by_id(user_id)
            if user_data:
                return User.from_dict(user_data)
            return None
        except Exception as e:
            self.logger.error(f"Error getting user by ID: {e}")
            return None
    
    def get_user_by_username(self, username):
        """Get a user by username."""
        try:
            user_data = self.find_one({"username": username})
            if user_data:
                return User.from_dict(user_data)
            return None
        except Exception as e:
            self.logger.error(f"Error getting user by username: {e}")
            return None
    
    def update_user(self, user_id, update_data):
        """Update a user's information."""
        try:
            # Don't allow updating username or email to existing values
            if 'username' in update_data:
                existing = self.find_one({
                    "username": update_data['username'],
                    "_id": {"$ne": ObjectId(user_id)}
                })
                if existing:
                    return False, "Username already exists"
            
            if 'email' in update_data:
                existing = self.find_one({
                    "email": update_data['email'],
                    "_id": {"$ne": ObjectId(user_id)}
                })
                if existing:
                    return False, "Email already exists"
            
            # Hash password if provided
            if 'password' in update_data:
                update_data['password_hash'] = generate_password_hash(update_data['password'])
                del update_data['password']
            
            # Update the user
            update_data['updated_at'] = datetime.utcnow()
            success = self.update_by_id(user_id, update_data)
            
            return success, None if success else "Failed to update user"
        except Exception as e:
            self.logger.error(f"Error updating user: {e}")
            return False, str(e)
    
    def change_password(self, user_id, current_password, new_password):
        """Change a user's password."""
        try:
            # Get the user
            user_data = self.find_by_id(user_id)
            if not user_data:
                return False, "User not found"
            
            # Check if the current password is correct
            if not check_password_hash(user_data['password_hash'], current_password):
                return False, "Current password is incorrect"
            
            # Update the password
            password_hash = generate_password_hash(new_password)
            success = self.update_by_id(user_id, {
                "password_hash": password_hash,
                "updated_at": datetime.utcnow()
            })
            
            return success, None if success else "Failed to change password"
        except Exception as e:
            self.logger.error(f"Error changing password: {e}")
            return False, str(e)
    
    def update_wallet_balance(self, user_id, amount, transaction_type, description=None, reference_id=None, created_by=None):
        """Update a user's wallet balance and create a transaction record."""
        try:
            # Get the user
            user_data = self.find_by_id(user_id)
            if not user_data:
                return False, None, "User not found"
            
            # Get current balance
            current_balance = user_data.get('wallet_balance', 0)
            
            # Calculate new balance
            new_balance = current_balance + amount
            
            # Create transaction record
            transaction = Transaction(
                user_id=user_id,
                username=user_data.get('username'),
                amount=amount,
                transaction_type=transaction_type,
                description=description,
                previous_balance=current_balance,
                new_balance=new_balance,
                reference_id=reference_id,
                created_by=created_by
            )
            
            # Insert transaction
            transaction_dict = transaction.to_dict()
            transaction_id = self.transactions.insert_one(transaction_dict).inserted_id
            
            if not transaction_id:
                return False, None, "Failed to create transaction record"
            
            # Update user's wallet balance
            success = self.update_by_id(user_id, {
                "wallet_balance": new_balance,
                "updated_at": datetime.utcnow(),
                "$push": {"transactions": str(transaction_id)}
            })
            
            if not success:
                # Rollback transaction if user update fails
                self.transactions.delete_one({"_id": transaction_id})
                return False, None, "Failed to update wallet balance"
            
            return True, transaction_id, None
        except Exception as e:
            self.logger.error(f"Error updating wallet balance: {e}")
            return False, None, str(e)
    
    def get_user_transactions(self, user_id, limit=20, skip=0, sort=None):
        """Get a user's transactions."""
        try:
            if sort is None:
                sort = [("created_at", -1)]  # Default sort by created_at desc
                
            transactions = self.transactions.find(
                {"user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id}
            ).sort(sort).skip(skip).limit(limit)
            
            return list(transactions)
        except Exception as e:
            self.logger.error(f"Error getting user transactions: {e}")
            return []
    
    @session_cached(ttl=300, key_prefix='user_count')
    @request_cached
    def count_users_by_role(self):
        """Count users by role."""
        try:
            pipeline = [
                {"$group": {"_id": "$role", "count": {"$sum": 1}}}
            ]
            
            results = self.aggregate(pipeline)
            
            # Convert to dictionary
            role_counts = {}
            for result in results:
                role_counts[result['_id']] = result['count']
            
            return role_counts
        except Exception as e:
            self.logger.error(f"Error counting users by role: {e}")
            return {}
    
    def get_users_by_role(self, role, skip=0, limit=10):
        """Get users by role with pagination.
        
        Args:
            role: The role to filter by
            skip: Number of records to skip (for pagination)
            limit: Maximum number of records to return
            
        Returns:
            List of User objects with the specified role
        """
        try:
            query = {"role": role}
            user_data = self.find_many(query, limit=limit, skip=skip, sort=[('created_at', -1)])
            
            # Convert to User objects
            users = []
            for data in user_data:
                try:
                    users.append(User.from_dict(data))
                except Exception as e:
                    self.logger.error(f"Error creating User object from data: {e}")
            
            return users
        except Exception as e:
            self.logger.error(f"Error getting users by role: {e}")
            return []

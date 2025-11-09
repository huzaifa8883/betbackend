from pymongo import MongoClient
from bson import ObjectId
import os
from datetime import datetime
import bcrypt
from models.user import User
from models.transaction import Transaction
from database.db_utils import get_db_utils, DB_CONFIG

class InMemoryCollection:
    """In-memory collection for development when MongoDB is not available."""
    
    def __init__(self):
        self.data = []
        self.indexes = {}
    
    def insert_one(self, document):
        """Insert a document into the collection."""
        if '_id' not in document:
            document['_id'] = ObjectId()
        self.data.append(document)
        return InsertOneResult(document['_id'])
    
    def find_one(self, query=None, projection=None):
        """Find a single document matching the query."""
        if query is None:
            query = {}
            
        for doc in self.data:
            match = True
            for key, value in query.items():
                if key not in doc or doc[key] != value:
                    match = False
                    break
            if match:
                if projection:
                    result = {}
                    for key in projection:
                        if key in doc:
                            result[key] = doc[key]
                    return result
                return doc
        return None
    
    def find(self, query=None, projection=None):
        """Find documents matching the query."""
        if query is None:
            query = {}
            
        results = []
        for doc in self.data:
            match = True
            for key, value in query.items():
                if key not in doc or doc[key] != value:
                    match = False
                    break
            if match:
                if projection:
                    result = {}
                    for key in projection:
                        if key in doc:
                            result[key] = doc[key]
                    results.append(result)
                else:
                    results.append(doc)
        return InMemoryCursor(results)
    
    def count_documents(self, query=None):
        """Count documents matching the query."""
        if query is None:
            query = {}
            
        count = 0
        for doc in self.data:
            match = True
            for key, value in query.items():
                if key not in doc or doc[key] != value:
                    match = False
                    break
            if match:
                count += 1
        return count
    
    def create_index(self, key, unique=False, sparse=False):
        """Create an index (no-op for in-memory)."""
        self.indexes[key] = {'unique': unique, 'sparse': sparse}
        return key
    
    def update_one(self, filter_dict, update_dict, upsert=False):
        """Update a single document in the collection."""
        for i, doc in enumerate(self.data):
            match = True
            for key, value in filter_dict.items():
                if key not in doc or doc[key] != value:
                    match = False
                    break
            if match:
                # Handle $set operator
                if '$set' in update_dict:
                    for key, value in update_dict['$set'].items():
                        self.data[i][key] = value
                # Handle $inc operator
                if '$inc' in update_dict:
                    for key, value in update_dict['$inc'].items():
                        if key in self.data[i]:
                            self.data[i][key] += value
                        else:
                            self.data[i][key] = value
                # Handle direct updates (without operators)
                for key, value in update_dict.items():
                    if not key.startswith('$'):
                        self.data[i][key] = value
                return UpdateResult(matched_count=1, modified_count=1)
        
        # If no match and upsert is True, insert a new document
        if upsert:
            new_doc = {}
            for key, value in filter_dict.items():
                new_doc[key] = value
            if '$set' in update_dict:
                for key, value in update_dict['$set'].items():
                    new_doc[key] = value
            self.insert_one(new_doc)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=new_doc.get('_id'))
        
        return UpdateResult(matched_count=0, modified_count=0)
    
    def delete_one(self, filter_dict):
        """Delete a single document from the collection."""
        for i, doc in enumerate(self.data):
            match = True
            for key, value in filter_dict.items():
                if key not in doc or doc[key] != value:
                    match = False
                    break
            if match:
                del self.data[i]
                return DeleteResult(deleted_count=1)
        return DeleteResult(deleted_count=0)
    
    def aggregate(self, pipeline):
        """Simple aggregation for in-memory collection."""
        if not pipeline or len(pipeline) == 0:
            return InMemoryCursor(self.data)
            
        # Handle basic $group aggregation for count_users_by_role
        if len(pipeline) == 1 and '$group' in pipeline[0]:
            group = pipeline[0]['$group']
            if group['_id'] == '$role' and 'count' in group and group['count']['$sum'] == 1:
                # Count by role
                role_counts = {}
                for doc in self.data:
                    role = doc.get('role', 'unknown')
                    if role not in role_counts:
                        role_counts[role] = 0
                    role_counts[role] += 1
                
                result = []
                for role, count in role_counts.items():
                    result.append({'_id': role, 'count': count})
                return InMemoryCursor(result)
        
        # Default fallback
        return InMemoryCursor([])

class InMemoryCursor:
    """Cursor for in-memory collection."""
    
    def __init__(self, data):
        self.data = data
        self.position = 0
    
    def __iter__(self):
        return self
    
    def __next__(self):
        if self.position >= len(self.data):
            raise StopIteration
        item = self.data[self.position]
        self.position += 1
        return item
    
    def skip(self, count):
        """Skip the first n results."""
        if count < len(self.data):
            self.data = self.data[count:]
        else:
            self.data = []
        return self
    
    def limit(self, count):
        """Limit the number of results."""
        self.data = self.data[:count]
        return self
    
    def sort(self, key, direction=1):
        """Sort the results."""
        # Simple sorting implementation
        reverse = direction == -1
        self.data.sort(key=lambda x: x.get(key, None) if x.get(key, None) is not None else '', reverse=reverse)
        return self

class InsertOneResult:
    """Result of insert_one operation."""
    
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id

class UpdateResult:
    """Result of update_one operation."""
    
    def __init__(self, matched_count=0, modified_count=0, upserted_id=None):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.upserted_id = upserted_id

class DeleteResult:
    """Result of delete_one operation."""
    
    def __init__(self, deleted_count=0):
        self.deleted_count = deleted_count

class UserService:
    """Service for user management and wallet operations using MongoDB."""
    
    def __init__(self, mongo_uri=None):
        """Initialize the user service with MongoDB connection."""
        try:
            # Use the standardized database utilities
            self.db_utils = get_db_utils()
            if mongo_uri:
                # If a specific URI is provided, create a new instance
                self.db_utils = get_db_utils().__class__(mongo_uri)
            
            print(f"Using MongoDB URI through db_utils")
            
            # Get standardized collection references
            self.users = self.db_utils.get_collection(DB_CONFIG["COLLECTIONS"]["USERS"])
            self.transactions = self.db_utils.get_collection(DB_CONFIG["COLLECTIONS"]["TRANSACTIONS"])
            self.client = self.db_utils.client
            self.db = self.db_utils.db
            
            # Print the number of users in MongoDB
            user_count = self.users.count_documents({})
            print(f"Found {user_count} users in {DB_CONFIG['COLLECTIONS']['USERS']} collection")
            
            # Print first few users for debugging
            for i, user in enumerate(self.users.find().limit(3)):
                print(f"MongoDB User {i+1}: {user.get('username')} (role: {user.get('role')})")
            
            # Create indexes for better performance
            try:
                self.users.create_index("username", unique=True)
                self.users.create_index("email", unique=True, sparse=True)  # Make email sparse to allow null values
                self.users.create_index("role")
                self.users.create_index("parent_id")
                
                self.transactions.create_index("user_id")
                self.transactions.create_index("timestamp")
                self.transactions.create_index("transaction_type")
            except Exception as e:
                print(f"Warning: Could not create indexes: {e}")
        except Exception as e:
            print(f"ERROR: Could not connect to MongoDB: {e}")
            print("Using in-memory fallback for development (data will not persist)")
            
            # Create in-memory fallback collections
            self.client = None
            self.db = None
            self.users = InMemoryCollection()
            self.transactions = InMemoryCollection()
            
            # Add some mock data for development
            self._add_mock_data()
    
    def _add_mock_data(self):
        """Add mock data for development when MongoDB is not available."""
        # Add mock users
        mock_users = [
            {
                "_id": ObjectId(),
                "username": "admin",
                "password": "$2b$12$1xxxxxxxxxxxxxxxxxxxxuZLbwxnPQ1Ht3bozWz1VFyeqg/C0W",  # hashed 'admin'
                "role": "admin",
                "full_name": "Admin User",
                "email": "admin@example.com",
                "wallet_balance": 1000.0,
                "status": "active",
                "created_at": datetime.now()
            },
            {
                "_id": ObjectId(),
                "username": "supermaster1",
                "password": "$2b$12$1xxxxxxxxxxxxxxxxxxxxuZLbwxnPQ1Ht3bozWz1VFyeqg/C0W",
                "role": "supermaster",
                "full_name": "Super Master 1",
                "email": "supermaster1@example.com",
                "wallet_balance": 5000.0,
                "status": "active",
                "created_at": datetime.now()
            },
            {
                "_id": ObjectId(),
                "username": "master1",
                "password": "$2b$12$1xxxxxxxxxxxxxxxxxxxxuZLbwxnPQ1Ht3bozWz1VFyeqg/C0W",
                "role": "master",
                "full_name": "Master 1",
                "email": "master1@example.com",
                "wallet_balance": 2000.0,
                "status": "active",
                "created_at": datetime.now()
            },
            {
                "_id": ObjectId(),
                "username": "user1",
                "password": "$2b$12$1xxxxxxxxxxxxxxxxxxxxuZLbwxnPQ1Ht3bozWz1VFyeqg/C0W",
                "role": "user",
                "full_name": "Regular User 1",
                "email": "user1@example.com",
                "wallet_balance": 500.0,
                "status": "active",
                "created_at": datetime.now()
            }
        ]
        
        for user in mock_users:
            self.users.insert_one(user)
    
    def create_user(self, username, email, password, role='user', full_name=None, 
                   phone=None, parent_id=None, initial_balance=0.0):
        """Create a new user."""
        # Check if username or email already exists
        if self.users.find_one({"username": username}):
            return False, "Username already exists"
        
        if self.users.find_one({"email": email}):
            return False, "Email already exists"
        
        # Check parent user if provided
        parent_user = None
        if parent_id:
            parent_user = self.get_user_by_id(parent_id)
            if not parent_user:
                return False, "Parent user not found"
        
        # Hash the password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Create user object
        user = User(
            username=username,
            email=email,
            password_hash=password_hash,
            role=role,
            full_name=full_name,
            phone=phone,
            wallet_balance=initial_balance,
            parent_id=ObjectId(parent_id) if parent_id else None
        )
        
        # Insert user into database
        user_id = self.users.insert_one(user.__dict__).inserted_id
        
        # Update parent's children list if applicable
        if parent_user:
            self.users.update_one(
                {"_id": ObjectId(parent_id)},
                {"$push": {"children": user_id}}
            )
        
        # Create initial balance transaction if needed
        if initial_balance > 0:
            transaction = Transaction(
                user_id=user_id,
                amount=initial_balance,
                transaction_type="credit",
                description="Initial balance",
                previous_balance=0,
                new_balance=initial_balance,
                created_by=ObjectId(parent_id) if parent_id else None
            )
            self.transactions.insert_one(transaction.__dict__)
        
        return True, str(user_id)
    
    def get_user_by_id(self, user_id):
        """Get user by ID."""
        try:
            user_data = self.users.find_one({"_id": ObjectId(user_id)})
            if user_data:
                return User.from_dict(user_data)
            return None
        except Exception as e:
            print(f"Error getting user by ID: {e}")
            return None
    
    def get_user_by_username(self, username):
        """Get user by username."""
        try:
            user_data = self.users.find_one({"username": username})
            if user_data:
                return User.from_dict(user_data)
            return None
        except Exception as e:
            print(f"Error getting user by username: {e}")
            return None
    
    def authenticate_user(self, username, password):
        """Authenticate a user with username and password."""
        user = self.get_user_by_username(username)
        if not user:
            return False, "User not found"
        
        # Check password
        if bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
            # Update last login time
            self.users.update_one(
                {"_id": user._id},
                {"$set": {"last_login": datetime.utcnow()}}
            )
            return True, user
        
        return False, "Invalid password"
    
    def update_user(self, user_id, update_data):
        """Update user information."""
        try:
            # Don't allow updating username or email to existing values
            if "username" in update_data:
                existing = self.users.find_one({"username": update_data["username"], "_id": {"$ne": ObjectId(user_id)}})
                if existing:
                    return False, "Username already exists"
            
            if "email" in update_data:
                existing = self.users.find_one({"email": update_data["email"], "_id": {"$ne": ObjectId(user_id)}})
                if existing:
                    return False, "Email already exists"
            
            # Hash password if provided
            if "password" in update_data:
                update_data["password_hash"] = bcrypt.hashpw(
                    update_data["password"].encode('utf-8'), 
                    bcrypt.gensalt()
                ).decode('utf-8')
                del update_data["password"]
            
            # Update user
            result = self.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": update_data}
            )
            
            if result.modified_count > 0:
                return True, "User updated successfully"
            return False, "No changes made"
        
        except Exception as e:
            print(f"Error updating user: {e}")
            return False, str(e)
    
    def delete_user(self, user_id):
        """Delete a user (soft delete by setting status to 'inactive')."""
        try:
            result = self.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"status": "inactive"}}
            )
            
            if result.modified_count > 0:
                return True, "User deactivated successfully"
            return False, "User not found or already inactive"
        
        except Exception as e:
            print(f"Error deleting user: {e}")
            return False, str(e)
    
    def get_users_by_role(self, role, skip=0, limit=20):
        """Get users by role with pagination."""
        try:
            users_data = list(self.users.find({"role": role}).skip(skip).limit(limit))
            return [User.from_dict(user_data) for user_data in users_data]
        except Exception as e:
            print(f"Error getting users by role: {e}")
            return []
    
    def get_users_by_parent(self, parent_id, skip=0, limit=20):
        """Get users created by a specific parent with pagination."""
        try:
            users_data = list(self.users.find({"parent_id": ObjectId(parent_id)}).skip(skip).limit(limit))
            return [User.from_dict(user_data) for user_data in users_data]
        except Exception as e:
            print(f"Error getting users by parent: {e}")
            return []
    
    def count_users_by_role(self):
        """Count users by role."""
        try:
            pipeline = [
                {"$group": {"_id": "$role", "count": {"$sum": 1}}}
            ]
            result = list(self.users.aggregate(pipeline))
            return {item["_id"]: item["count"] for item in result}
        except Exception as e:
            print(f"Error counting users by role: {e}")
            return {}
    
    def update_wallet_balance(self, user_id, amount, transaction_type, description=None, created_by=None):
        """Update user wallet balance and create a transaction record."""
        try:
            user = self.get_user_by_id(user_id)
            if not user:
                return False, "User not found"
            
            previous_balance = user.wallet_balance
            
            # Update balance based on transaction type
            if transaction_type == "credit":
                new_balance = previous_balance + float(amount)
            elif transaction_type == "debit":
                if previous_balance < float(amount):
                    return False, "Insufficient funds"
                new_balance = previous_balance - float(amount)
            else:
                return False, "Invalid transaction type"
            
            # Update user balance
            self.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"wallet_balance": new_balance}}
            )
            
            # Create transaction record
            transaction = Transaction(
                user_id=ObjectId(user_id),
                amount=float(amount),
                transaction_type=transaction_type,
                description=description,
                previous_balance=previous_balance,
                new_balance=new_balance,
                created_by=ObjectId(created_by) if created_by else None
            )
            
            transaction_id = self.transactions.insert_one(transaction.__dict__).inserted_id
            
            return True, {
                "transaction_id": str(transaction_id),
                "previous_balance": previous_balance,
                "new_balance": new_balance,
                "amount": float(amount),
                "type": transaction_type
            }
        
        except Exception as e:
            print(f"Error updating wallet balance: {e}")
            return False, str(e)
    
    def get_user_transactions(self, user_id, skip=0, limit=20, transaction_type=None):
        """Get transactions for a specific user with pagination and optional filtering."""
        try:
            query = {"user_id": ObjectId(user_id)}
            if transaction_type:
                query["transaction_type"] = transaction_type
                
            transactions_data = list(
                self.transactions.find(query)
                .sort("timestamp", -1)
                .skip(skip)
                .limit(limit)
            )
            
            return [Transaction.from_dict(t) for t in transactions_data]
        except Exception as e:
            print(f"Error getting user transactions: {e}")
            return []
    
    def get_transaction_by_id(self, transaction_id):
        """Get transaction by ID."""
        try:
            transaction_data = self.transactions.find_one({"_id": ObjectId(transaction_id)})
            if transaction_data:
                return Transaction.from_dict(transaction_data)
            return None
        except Exception as e:
            print(f"Error getting transaction by ID: {e}")
            return None
    
    def create_admin_user_if_not_exists(self):
        """Create an admin user if one doesn't exist."""
        if not self.users.find_one({"role": "admin"}):
            # Create admin user
            admin_password = "admin123"  # This should be changed immediately after first login
            self.create_user(
                username="admin",
                email="admin@betpro.com",
                password=admin_password,
                role="admin",
                full_name="System Administrator",
                initial_balance=1000.0
            )
            print("Admin user created with username 'admin' and password 'admin123'")
            print("Please change the admin password after first login")
            
    def get_user_hierarchy(self, user_id):
        """Get the complete hierarchy for a user (ancestors and descendants)."""
        try:
            user = self.get_user_by_id(user_id)
            if not user:
                return None
                
            # Get ancestors (parent chain)
            ancestors = []
            current_parent_id = user.parent_id
            while current_parent_id:
                parent = self.get_user_by_id(current_parent_id)
                if parent:
                    ancestors.append(parent.to_safe_dict())
                    current_parent_id = parent.parent_id
                else:
                    break
                    
            # Get immediate children
            children = self.get_users_by_parent(user_id)
            children_data = [child.to_safe_dict() for child in children]
            
            return {
                "user": user.to_safe_dict(),
                "ancestors": ancestors,
                "children": children_data
            }
        except Exception as e:
            print(f"Error getting user hierarchy: {e}")
            return None

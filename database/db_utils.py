"""
Database utility functions for backend server
Provides standardized methods for database operations
"""

import os
import json
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime

# Load the shared DB config
def load_db_config():
    """Load the shared database configuration from the JS file"""
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
                              'shared', 'db-config.js')
    
    # Extract the DB_CONFIG object from the JS file
    with open(config_path, 'r') as f:
        content = f.read()
        # Find the DB_CONFIG object
        start = content.find('const DB_CONFIG = {')
        end = content.find('};', start)
        if start == -1 or end == -1:
            raise ValueError("Could not find DB_CONFIG in the shared config file")
        
        # Extract and parse the JSON-like object
        config_str = content[start + len('const DB_CONFIG = '):end + 1]
        # Convert JS object to valid JSON
        config_str = config_str.replace("'", '"')
        
        # Parse the JSON
        try:
            return json.loads(config_str)
        except json.JSONDecodeError:
            # Fallback to default config if parsing fails
            return {
                "DATABASE_NAME": "betpro",
                "COLLECTIONS": {
                    "USERS": "users",
                    "TRANSACTIONS": "Transactions",
                    "BETS": "Bets",
                    "EVENTS": "Events",
                    "MARKETS": "Markets",
                    "SESSIONS": "sessions",
                    "SETTINGS": "Settings"
                }
            }

# Load the DB config
DB_CONFIG = load_db_config()

class DatabaseUtils:
    """Utility class for database operations"""
    
    def __init__(self, mongo_uri=None):
        """Initialize the database connection"""
        if not mongo_uri:
            mongo_uri = os.environ.get('MONGODB_URI', 'mongodb+srv://alsexch247:mongo2025@cluster0.zvcyftu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
        
        self.client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        self.db = self.client[DB_CONFIG["DATABASE_NAME"]]
    
    def get_collection(self, collection_name):
        """Get a collection by its standardized name from DB_CONFIG"""
        if collection_name in DB_CONFIG["COLLECTIONS"].values():
            return self.db[collection_name]
        else:
            raise ValueError(f"Collection {collection_name} not defined in DB_CONFIG")
    
    # User operations
    def find_user_by_username(self, username, case_insensitive=False):
        """Find a user by username"""
        users_collection = self.get_collection(DB_CONFIG["COLLECTIONS"]["USERS"])
        
        if case_insensitive:
            import re
            regex = re.compile(f"^{username}$", re.IGNORECASE)
            return users_collection.find_one({"username": regex})
        else:
            return users_collection.find_one({"username": username})
    
    def create_user(self, user_data):
        """Create a new user"""
        users_collection = self.get_collection(DB_CONFIG["COLLECTIONS"]["USERS"])
        
        # Add created_at timestamp if not provided
        if "created_at" not in user_data:
            user_data["created_at"] = datetime.now()
        
        result = users_collection.insert_one(user_data)
        user_data["_id"] = result.inserted_id
        return user_data
    
    def update_user(self, user_id, update_data):
        """Update a user by ID"""
        users_collection = self.get_collection(DB_CONFIG["COLLECTIONS"]["USERS"])
        
        # Add last_updated timestamp
        update_data["last_updated"] = datetime.now()
        
        return users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
    
    def get_all_users(self, filter_dict=None, options=None):
        """Get all users with optional filtering"""
        users_collection = self.get_collection(DB_CONFIG["COLLECTIONS"]["USERS"])
        
        filter_dict = filter_dict or {}
        options = options or {}
        
        cursor = users_collection.find(filter_dict)
        
        # Apply options
        if "sort" in options:
            cursor = cursor.sort(options["sort"])
        if "limit" in options:
            cursor = cursor.limit(options["limit"])
        
        return list(cursor)
    
    # Transaction operations
    def create_transaction(self, transaction_data):
        """Create a new transaction"""
        transactions_collection = self.get_collection(DB_CONFIG["COLLECTIONS"]["TRANSACTIONS"])
        
        # Add created_at timestamp if not provided
        if "created_at" not in transaction_data:
            transaction_data["created_at"] = datetime.now()
        
        result = transactions_collection.insert_one(transaction_data)
        transaction_data["_id"] = result.inserted_id
        return transaction_data
    
    def get_user_transactions(self, user_id):
        """Get transactions for a user"""
        transactions_collection = self.get_collection(DB_CONFIG["COLLECTIONS"]["TRANSACTIONS"])
        
        return list(transactions_collection.find(
            {"user_id": ObjectId(user_id)}
        ).sort("created_at", -1))
    
    # Bet operations
    def create_bet(self, bet_data):
        """Create a new bet"""
        bets_collection = self.get_collection(DB_CONFIG["COLLECTIONS"]["BETS"])
        
        # Add created_at timestamp if not provided
        if "created_at" not in bet_data:
            bet_data["created_at"] = datetime.now()
        
        result = bets_collection.insert_one(bet_data)
        bet_data["_id"] = result.inserted_id
        return bet_data
    
    def get_user_bets(self, user_id):
        """Get bets for a user"""
        bets_collection = self.get_collection(DB_CONFIG["COLLECTIONS"]["BETS"])
        
        return list(bets_collection.find(
            {"user_id": ObjectId(user_id)}
        ).sort("created_at", -1))
    
    def close(self):
        """Close the database connection"""
        if self.client:
            self.client.close()

# Create a singleton instance for easy import
db_utils = DatabaseUtils()

# For use in other modules
def get_db_utils():
    """Get the database utils instance"""
    return db_utils

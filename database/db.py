"""
Database connection and initialization module.

This module handles MongoDB connection setup, database initialization,
and provides access to the database instance throughout the application.
"""
from pymongo import MongoClient
from database.db_config import DATABASE_NAME, COLLECTIONS
import os
import logging
from urllib.parse import urlparse

# MongoDB connection objects
_db_client = None
_db = None

# Track initialization status
_db_initialized = False

def init_db(mongodb_uri=None):
    """
    Initialize database connection with the provided URI or from environment.
    Uses a singleton pattern to prevent repeated initialization.
    
    Args:
        mongodb_uri: MongoDB connection URI string. If None, will use MONGODB_URI from environment.
        
    Returns:
        The database instance
    
    Raises:
        ValueError: If no MongoDB URI is provided or found in environment.
    """
    global _db_client, _db, _db_initialized
    
    # If already initialized, don't initialize again
    if _db_initialized and _db_client is not None:
        logging.debug("Database already initialized, returning existing connection")
        return _db
    
    # Use environment variable if not provided
    if not mongodb_uri:
        mongodb_uri = os.environ.get('MONGODB_URI')
    
    if not mongodb_uri:
        raise ValueError("MongoDB URI must be provided or set as MONGODB_URI environment variable")
    
    try:
        # Connect to MongoDB with connection pooling
        _db_client = MongoClient(
            mongodb_uri,
            maxPoolSize=50,  # Maximum number of connections in the connection pool
            connectTimeoutMS=5000,  # How long to wait for a connection (5 seconds)
            socketTimeoutMS=30000,  # How long a send/receive can take (30 seconds)
            serverSelectionTimeoutMS=5000,  # How long to wait for server selection (5 seconds)
            waitQueueTimeoutMS=1000,  # How long a thread will wait for a connection (1 second)
            retryWrites=True,  # Retry write operations if they fail
            w='majority'  # Write concern - wait for write to be acknowledged by majority of replicas
        )
        
        # Test connection
        _db_client.admin.command('ping')
        
        # Get database instance
        _db = _db_client[DATABASE_NAME]
        
        # Initialize collections and indexes
        _initialize_collections()
        
        # Mark as initialized
        _db_initialized = True
        logging.info("Connected to MongoDB successfully")
        
        return _db
        
    except Exception as e:
        logging.error(f"Failed to connect to MongoDB: {e}")
        raise

def _initialize_collections():
    """Initialize database collections and indexes."""
    global _db
    
    # Create indexes only on first initialization
    _create_indexes(_db)
    
    logging.debug("Database collections initialized successfully")

def _create_indexes(db):
    """
    Create database indexes for better query performance.
    Safely handles existing indexes to avoid conflicts.
    
    Args:
        db: MongoDB database instance
    """
    try:
        # User collection indexes - safely create with drop_dups=False
        _safe_create_index(db[COLLECTIONS["USERS"]], 'username', unique=True)
        _safe_create_index(db[COLLECTIONS["USERS"]], 'email', unique=True)
        
        # Transactions collection indexes
        _safe_create_index(db[COLLECTIONS["TRANSACTIONS"]], 'user_id')
        _safe_create_index(db[COLLECTIONS["TRANSACTIONS"]], 'timestamp', direction=-1)
        
        # Bets collection indexes
        _safe_create_index(db[COLLECTIONS["BETS"]], 'user_id')
        _safe_create_index(db[COLLECTIONS["BETS"]], 'market_id')
        _safe_create_index(db[COLLECTIONS["BETS"]], ['status', 'market_id'])
        
        # Markets collection indexes
        _safe_create_index(db[COLLECTIONS["MARKETS"]], 'market_id', unique=True)
        _safe_create_index(db[COLLECTIONS["MARKETS"]], 'event_id')
        _safe_create_index(db[COLLECTIONS["MARKETS"]], 'start_time')
        
        logging.info("Database indexes created or verified successfully")
    except Exception as e:
        logging.warning(f"Error creating some indexes: {str(e)}")

def _safe_create_index(collection, field_or_fields, direction=1, **kwargs):
    """
    Safely create an index, handling existing indexes gracefully.
    
    Args:
        collection: MongoDB collection
        field_or_fields: Field name or list of field names
        direction: Index direction (1=ascending, -1=descending)
        **kwargs: Additional index options
    """
    try:
        # Convert single field to list format
        if isinstance(field_or_fields, str):
            keys = [(field_or_fields, direction)]
            index_spec = [(field_or_fields, direction)]
        elif isinstance(field_or_fields, list) and all(isinstance(f, str) for f in field_or_fields):
            keys = [(f, direction) for f in field_or_fields]
            index_spec = [(f, direction) for f in field_or_fields]
        else:
            keys = field_or_fields
            index_spec = field_or_fields
        
        # Check if index already exists by comparing key specs
        existing_indexes = collection.index_information()
        for idx_name, idx_info in existing_indexes.items():
            if idx_name == "_id_":  # Skip the default _id index
                continue
                
            # Get the key specification for this index
            existing_keys = idx_info.get('key', [])
            
            # Check if the key specs match (same fields in same order with same directions)
            if len(existing_keys) == len(index_spec):
                is_same = True
                for i, (field, dir_val) in enumerate(index_spec):
                    if existing_keys[i][0] != field or existing_keys[i][1] != dir_val:
                        is_same = False
                        break
                        
                if is_same:
                    # Check if the options match (unique, sparse, etc.)
                    options_match = True
                    for key_opt, val_opt in kwargs.items():
                        # Convert key names to match MongoDB's index info format
                        mongo_key = key_opt
                        if key_opt == 'unique':
                            if idx_info.get('unique', False) != val_opt:
                                options_match = False
                                break
                        elif key_opt == 'sparse':
                            if idx_info.get('sparse', False) != val_opt:
                                options_match = False
                                break
                    
                    if options_match:
                        # Index with same spec and options already exists
                        logging.debug(f"Index already exists on {collection.name} with spec {index_spec}")
                        return
                    else:
                        # Same keys but different options - drop and recreate
                        logging.debug(f"Dropping index {idx_name} on {collection.name} to update options")
                        collection.drop_index(idx_name)
                        break
        
        # Create the index if it doesn't exist or was dropped to update options
        collection.create_index(index_spec, background=True, **kwargs)
        logging.debug(f"Created index on {collection.name} with spec {index_spec}")
    except Exception as e:
        # Log the error but don't fail
        logging.warning(f"Could not create index: {str(e)}")

def get_db():
    """
    Get the database instance. Initialize if not already done.
    Uses a singleton pattern to prevent repeated initialization.
    
    Returns:
        The database instance
    """
    global _db, _db_initialized
    
    if not _db_initialized or _db is None:
        logging.debug("Initializing database connection")
        init_db()
    else:
        logging.debug("Using existing database connection")
        
    return _db

def close_db_connections():
    """
    Close MongoDB connections properly during application shutdown.
    This helps prevent connection-related errors during restart.
    """
    global _db_client, _db, _db_initialized
    
    try:
        if _db_client is not None:
            logging.info("Closing MongoDB connections")
            _db_client.close()
            _db_client = None
            _db = None
            _db_initialized = False
            return True
    except Exception as e:
        logging.error(f"Error closing MongoDB connections: {e}")
    
    return False

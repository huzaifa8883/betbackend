"""Base service class for the BetPro Backend application.

This module provides a base service class with common functionality
for all services in the application.
"""
import logging
from bson import ObjectId
from database.db import get_db

class BaseService:
    """Base service class with common database operations."""
    
    def __init__(self, collection_name):
        """Initialize a base service with a collection name."""
        self.collection_name = collection_name
        self.db = get_db()
        self.collection = self.db[collection_name]
        self.logger = logging.getLogger(f"service.{collection_name}")
    
    def find_by_id(self, id):
        """Find a document by its ID."""
        try:
            if isinstance(id, str):
                id = ObjectId(id)
            return self.collection.find_one({"_id": id})
        except Exception as e:
            self.logger.error(f"Error finding document by ID: {e}")
            return None
    
    def find_one(self, query):
        """Find a single document matching the query."""
        try:
            return self.collection.find_one(query)
        except Exception as e:
            self.logger.error(f"Error finding document: {e}")
            return None
    
    def find_many(self, query, projection=None, sort=None, limit=0, skip=0):
        """Find multiple documents matching the query."""
        try:
            cursor = self.collection.find(query, projection)
            
            if sort:
                cursor = cursor.sort(sort)
            
            if skip:
                cursor = cursor.skip(skip)
            
            if limit:
                cursor = cursor.limit(limit)
            
            return list(cursor)
        except Exception as e:
            self.logger.error(f"Error finding documents: {e}")
            return []
    
    def count(self, query=None):
        """Count documents matching the query."""
        try:
            if query is None:
                query = {}
            return self.collection.count_documents(query)
        except Exception as e:
            self.logger.error(f"Error counting documents: {e}")
            return 0
    
    def insert_one(self, document):
        """Insert a single document."""
        try:
            result = self.collection.insert_one(document)
            return result.inserted_id
        except Exception as e:
            self.logger.error(f"Error inserting document: {e}")
            return None
    
    def insert_many(self, documents):
        """Insert multiple documents."""
        try:
            result = self.collection.insert_many(documents)
            return result.inserted_ids
        except Exception as e:
            self.logger.error(f"Error inserting documents: {e}")
            return []
    
    def update_by_id(self, id, update_data):
        """Update a document by its ID."""
        try:
            if isinstance(id, str):
                id = ObjectId(id)
            result = self.collection.update_one(
                {"_id": id},
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            self.logger.error(f"Error updating document: {e}")
            return False
    
    def update_one(self, query, update_data):
        """Update a single document matching the query."""
        try:
            result = self.collection.update_one(
                query,
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            self.logger.error(f"Error updating document: {e}")
            return False
    
    def update_many(self, query, update_data):
        """Update multiple documents matching the query."""
        try:
            result = self.collection.update_many(
                query,
                {"$set": update_data}
            )
            return result.modified_count
        except Exception as e:
            self.logger.error(f"Error updating documents: {e}")
            return 0
    
    def delete_by_id(self, id):
        """Delete a document by its ID."""
        try:
            if isinstance(id, str):
                id = ObjectId(id)
            result = self.collection.delete_one({"_id": id})
            return result.deleted_count > 0
        except Exception as e:
            self.logger.error(f"Error deleting document: {e}")
            return False
    
    def delete_one(self, query):
        """Delete a single document matching the query."""
        try:
            result = self.collection.delete_one(query)
            return result.deleted_count > 0
        except Exception as e:
            self.logger.error(f"Error deleting document: {e}")
            return False
    
    def delete_many(self, query):
        """Delete multiple documents matching the query."""
        try:
            result = self.collection.delete_many(query)
            return result.deleted_count
        except Exception as e:
            self.logger.error(f"Error deleting documents: {e}")
            return 0
    
    def aggregate(self, pipeline):
        """Run an aggregation pipeline."""
        try:
            return list(self.collection.aggregate(pipeline))
        except Exception as e:
            self.logger.error(f"Error running aggregation: {e}")
            return []

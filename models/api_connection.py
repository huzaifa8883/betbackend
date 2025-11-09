"""API Connection model for the BetPro Backend application.

This module provides the APIConnection model class for managing
connections to external APIs like Betfair.
"""
from datetime import datetime, timedelta
from models.base import BaseModel

class APIConnection(BaseModel):
    """API Connection model for managing external API connections."""
    
    # API types
    TYPE_BETFAIR = 'BETFAIR'
    TYPE_PAYMENT = 'PAYMENT'
    TYPE_OTHER = 'OTHER'
    
    # Connection status
    STATUS_CONNECTED = 'CONNECTED'
    STATUS_DISCONNECTED = 'DISCONNECTED'
    STATUS_ERROR = 'ERROR'
    
    def __init__(self, api_type, app_key=None, session_token=None, 
                 username=None, status='DISCONNECTED', last_connected=None,
                 session_expiry=None, error_message=None, connection_data=None,
                 _id=None, created_at=None, updated_at=None):
        """Initialize an API connection object."""
        # Initialize the base model
        super().__init__(_id, created_at, updated_at)
        
        # API connection specific attributes
        self.api_type = api_type
        self.app_key = app_key
        self.session_token = session_token
        self.username = username
        self.status = status
        self.last_connected = last_connected
        self.session_expiry = session_expiry
        self.error_message = error_message
        self.connection_data = connection_data or {}  # Additional connection data
    
    def is_connected(self):
        """Check if the API is currently connected."""
        return self.status == self.STATUS_CONNECTED
    
    def is_session_valid(self):
        """Check if the session is still valid."""
        if not self.session_expiry:
            return False
        
        return datetime.utcnow() < self.session_expiry
    
    def get_session_expiry_time(self):
        """Get the session expiry time in hours and minutes."""
        if not self.session_expiry:
            return {'hours': 0, 'minutes': 0}
        
        time_left = self.session_expiry - datetime.utcnow()
        
        if time_left.total_seconds() <= 0:
            return {'hours': 0, 'minutes': 0}
        
        hours = time_left.seconds // 3600
        minutes = (time_left.seconds % 3600) // 60
        
        return {'hours': hours, 'minutes': minutes}
    
    def connect(self, session_token=None, app_key=None, expiry_hours=8):
        """Connect to the API."""
        self.status = self.STATUS_CONNECTED
        self.last_connected = datetime.utcnow()
        self.session_expiry = datetime.utcnow() + timedelta(hours=expiry_hours)
        self.error_message = None
        
        if session_token:
            self.session_token = session_token
        
        if app_key:
            self.app_key = app_key
        
        self.updated_at = datetime.utcnow()
        return True
    
    def disconnect(self, error_message=None):
        """Disconnect from the API."""
        self.status = self.STATUS_ERROR if error_message else self.STATUS_DISCONNECTED
        self.error_message = error_message
        self.updated_at = datetime.utcnow()
        return True
    
    def to_dict(self):
        """Convert API connection object to dictionary."""
        result = super().to_dict()
        
        # Don't include sensitive information
        if 'session_token' in result:
            result['session_token'] = '***' if result['session_token'] else None
        
        if 'app_key' in result:
            result['app_key'] = '***' if result['app_key'] else None
        
        return result

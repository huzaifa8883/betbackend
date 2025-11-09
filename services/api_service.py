"""API service for the BetPro Backend application.

This module provides the APIService class for handling external API
connections, particularly Betfair API integration.
"""
import logging
from datetime import datetime, timedelta
import betfairlightweight
from models.api_connection import APIConnection
from services.base_service import BaseService
from utils.cache import session_cached, request_cached, SimpleCache

# Create a cache for API clients
api_client_cache = SimpleCache()

class APIService(BaseService):
    """API service for handling external API connections."""
    
    def __init__(self):
        """Initialize the API service."""
        super().__init__('api_connections')
        self.logger = logging.getLogger('service.api')
    
    def get_connection(self, api_type):
        """Get an API connection by type."""
        try:
            connection_data = self.find_one({"api_type": api_type})
            if connection_data:
                return APIConnection.from_dict(connection_data)
            return None
        except Exception as e:
            self.logger.error(f"Error getting API connection: {e}")
            return None
    
    def create_or_update_connection(self, api_type, app_key=None, session_token=None, 
                                   username=None, status='DISCONNECTED', connection_data=None):
        """Create or update an API connection."""
        try:
            # Check if connection already exists
            existing = self.find_one({"api_type": api_type})
            
            if existing:
                # Update existing connection
                update_data = {
                    "updated_at": datetime.utcnow()
                }
                
                if app_key:
                    update_data["app_key"] = app_key
                
                if session_token:
                    update_data["session_token"] = session_token
                
                if username:
                    update_data["username"] = username
                
                if status:
                    update_data["status"] = status
                
                if connection_data:
                    update_data["connection_data"] = connection_data
                
                success = self.update_by_id(existing['_id'], update_data)
                return existing['_id'], None if success else "Failed to update API connection"
            else:
                # Create new connection
                connection = APIConnection(
                    api_type=api_type,
                    app_key=app_key,
                    session_token=session_token,
                    username=username,
                    status=status,
                    connection_data=connection_data
                )
                
                connection_dict = connection.to_dict()
                connection_id = self.insert_one(connection_dict)
                
                return connection_id, None
        except Exception as e:
            self.logger.error(f"Error creating/updating API connection: {e}")
            return None, str(e)
    
    def connect_betfair(self, app_key, session_token, username=None):
        """Connect to Betfair API."""
        try:
            # Create Betfair client
            client = betfairlightweight.APIClient(
                username=username or '',
                password='',
                app_key=app_key,
                certs=None,
                session_token=session_token
            )
            
            # Test connection by getting account details
            account_details = client.account.get_account_details()
            
            if not account_details or not hasattr(account_details, 'response'):
                return False, "Failed to connect to Betfair API"
            
            # Store client in cache
            api_client_cache.set('betfair_client', client, ttl=3600)  # Cache for 1 hour
            
            # Update connection record
            connection_data = {
                "account_id": getattr(account_details.response, 'id', None),
                "currency_code": getattr(account_details.response, 'currencyCode', None),
                "locale": getattr(account_details.response, 'locale', None)
            }
            
            connection_id, error = self.create_or_update_connection(
                api_type=APIConnection.TYPE_BETFAIR,
                app_key=app_key,
                session_token=session_token,
                username=username,
                status=APIConnection.STATUS_CONNECTED,
                connection_data=connection_data
            )
            
            if not connection_id:
                return False, error or "Failed to update connection record"
            
            # Update connection with session expiry
            self.update_by_id(connection_id, {
                "last_connected": datetime.utcnow(),
                "session_expiry": datetime.utcnow() + timedelta(hours=8),  # Betfair sessions last 8 hours
                "error_message": None
            })
            
            return True, None
        except Exception as e:
            self.logger.error(f"Error connecting to Betfair: {e}")
            
            # Update connection record with error
            self.create_or_update_connection(
                api_type=APIConnection.TYPE_BETFAIR,
                status=APIConnection.STATUS_ERROR,
                error_message=str(e)
            )
            
            return False, str(e)
    
    def disconnect_betfair(self, error_message=None):
        """Disconnect from Betfair API."""
        try:
            # Remove client from cache
            api_client_cache.delete('betfair_client')
            
            # Update connection record
            connection_id, _ = self.create_or_update_connection(
                api_type=APIConnection.TYPE_BETFAIR,
                status=APIConnection.STATUS_DISCONNECTED,
                error_message=error_message
            )
            
            return True, None
        except Exception as e:
            self.logger.error(f"Error disconnecting from Betfair: {e}")
            return False, str(e)
    
    @request_cached
    def get_betfair_client(self):
        """Get the Betfair API client."""
        try:
            # Check cache first
            client = api_client_cache.get('betfair_client')
            if client:
                return client
            
            # Get connection details
            connection = self.get_connection(APIConnection.TYPE_BETFAIR)
            if not connection or not connection.is_connected():
                return None
            
            # Create client
            client = betfairlightweight.APIClient(
                username=connection.username or '',
                password='',
                app_key=connection.app_key,
                certs=None,
                session_token=connection.session_token
            )
            
            # Store in cache
            api_client_cache.set('betfair_client', client, ttl=3600)  # Cache for 1 hour
            
            return client
        except Exception as e:
            self.logger.error(f"Error getting Betfair client: {e}")
            return None
    
    @session_cached(ttl=60, key_prefix='api_status')
    @request_cached
    def get_api_status(self):
        """Get API connection status."""
        try:
            # Get Betfair connection
            betfair_connection = self.get_connection(APIConnection.TYPE_BETFAIR)
            
            if not betfair_connection:
                return {
                    'betfair_connected': False,
                    'database_connected': True,  # If we got this far, DB is connected
                    'session_valid': False,
                    'session_expiry': None,
                    'session_expiry_hours': 0,
                    'session_expiry_minutes': 0
                }
            
            # Check if session is valid
            session_valid = betfair_connection.is_session_valid()
            
            # Get expiry time
            expiry_time = betfair_connection.get_session_expiry_time()
            
            return {
                'betfair_connected': betfair_connection.is_connected(),
                'database_connected': True,
                'session_valid': session_valid,
                'session_expiry': betfair_connection.session_expiry.strftime('%Y-%m-%d %H:%M:%S') if betfair_connection.session_expiry else None,
                'session_expiry_hours': expiry_time['hours'],
                'session_expiry_minutes': expiry_time['minutes']
            }
        except Exception as e:
            self.logger.error(f"Error getting API status: {e}")
            return {
                'betfair_connected': False,
                'database_connected': True,  # If we got this far, DB is connected
                'session_valid': False,
                'session_expiry': None,
                'session_expiry_hours': 0,
                'session_expiry_minutes': 0
            }

"""Event service for the BetPro Backend application.

This module provides the EventService class for handling betting events
and markets operations.
"""
import logging
from datetime import datetime
from bson import ObjectId
from models.event import Event, Market
from services.base_service import BaseService
from utils.cache import session_cached, request_cached

class EventService(BaseService):
    """Event service for handling betting events and markets."""
    
    def __init__(self):
        """Initialize the event service."""
        super().__init__('events')
        self.markets = self.db['markets']
        self.logger = logging.getLogger('service.event')
    
    def create_event(self, event_data):
        """Create a new event."""
        try:
            # Check if event already exists
            existing = self.find_one({"event_id": event_data.get('event_id')})
            if existing:
                return existing['_id'], "Event already exists"
            
            # Create event object
            event = Event(**event_data)
            
            # Insert event
            event_dict = event.to_dict()
            event_id = self.insert_one(event_dict)
            
            return event_id, None
        except Exception as e:
            self.logger.error(f"Error creating event: {e}")
            return None, str(e)
    
    def update_event(self, event_id, update_data):
        """Update an event."""
        try:
            # Update the event
            update_data['updated_at'] = datetime.utcnow()
            success = self.update_by_id(event_id, update_data)
            
            return success, None if success else "Failed to update event"
        except Exception as e:
            self.logger.error(f"Error updating event: {e}")
            return False, str(e)
    
    def get_event(self, event_id):
        """Get an event by ID."""
        try:
            event_data = self.find_by_id(event_id)
            if event_data:
                return Event.from_dict(event_data)
            return None
        except Exception as e:
            self.logger.error(f"Error getting event: {e}")
            return None
    
    def get_event_by_betfair_id(self, betfair_id):
        """Get an event by Betfair ID."""
        try:
            event_data = self.find_one({"event_id": betfair_id})
            if event_data:
                return Event.from_dict(event_data)
            return None
        except Exception as e:
            self.logger.error(f"Error getting event by Betfair ID: {e}")
            return None
    
    @session_cached(ttl=60, key_prefix='active_events')
    @request_cached
    def get_active_events(self, category=None, limit=50, skip=0):
        """Get active events."""
        try:
            query = {"status": Event.STATUS_OPEN}
            
            if category:
                query["category"] = category
            
            events = self.find_many(
                query=query,
                sort=[("open_date", 1)],
                limit=limit,
                skip=skip
            )
            
            return [Event.from_dict(event) for event in events]
        except Exception as e:
            self.logger.error(f"Error getting active events: {e}")
            return []
    
    def create_market(self, market_data):
        """Create a new market."""
        try:
            # Check if market already exists
            existing = self.markets.find_one({"market_id": market_data.get('market_id')})
            if existing:
                return existing['_id'], "Market already exists"
            
            # Create market object
            market = Market(**market_data)
            
            # Insert market
            market_dict = market.to_dict()
            market_id = self.markets.insert_one(market_dict).inserted_id
            
            if market_id:
                # Update event's markets list
                event_id = market_data.get('event_id')
                if event_id:
                    self.update_by_id(event_id, {
                        "$push": {"markets": str(market_id)},
                        "$inc": {"market_count": 1},
                        "updated_at": datetime.utcnow()
                    })
            
            return market_id, None
        except Exception as e:
            self.logger.error(f"Error creating market: {e}")
            return None, str(e)
    
    def update_market(self, market_id, update_data):
        """Update a market."""
        try:
            # Update the market
            update_data['updated_at'] = datetime.utcnow()
            success = self.update_by_id(market_id, update_data)
            
            return success, None if success else "Failed to update market"
        except Exception as e:
            self.logger.error(f"Error updating market: {e}")
            return False, str(e)
    
    def get_market(self, market_id):
        """Get a market by ID."""
        try:
            market_data = self.markets.find_one({"_id": ObjectId(market_id)})
            if market_data:
                return Market.from_dict(market_data)
            return None
        except Exception as e:
            self.logger.error(f"Error getting market: {e}")
            return None
    
    def get_market_by_betfair_id(self, betfair_id):
        """Get a market by Betfair ID."""
        try:
            market_data = self.markets.find_one({"market_id": betfair_id})
            if market_data:
                return Market.from_dict(market_data)
            return None
        except Exception as e:
            self.logger.error(f"Error getting market by Betfair ID: {e}")
            return None
    
    def get_event_markets(self, event_id, limit=0, skip=0):
        """Get markets for an event."""
        try:
            markets = self.markets.find(
                {"event_id": event_id},
                sort=[("start_time", 1)],
                limit=limit,
                skip=skip
            )
            
            return [Market.from_dict(market) for market in markets]
        except Exception as e:
            self.logger.error(f"Error getting event markets: {e}")
            return []
    
    def update_market_selections(self, market_id, selections):
        """Update selections for a market."""
        try:
            market = self.get_market(market_id)
            if not market:
                return False, "Market not found"
            
            for selection in selections:
                market.add_selection(selection)
            
            success = self.markets.update_one(
                {"_id": ObjectId(market_id)},
                {"$set": {
                    "selections": market.selections,
                    "updated_at": datetime.utcnow()
                }}
            ).modified_count > 0
            
            return success, None if success else "Failed to update selections"
        except Exception as e:
            self.logger.error(f"Error updating market selections: {e}")
            return False, str(e)
    
    @session_cached(ttl=300, key_prefix='event_stats')
    @request_cached
    def get_event_stats(self):
        """Get statistics about events."""
        try:
            # Count events by status
            status_pipeline = [
                {"$group": {"_id": "$status", "count": {"$sum": 1}}}
            ]
            status_results = self.aggregate(status_pipeline)
            
            # Count events by category
            category_pipeline = [
                {"$group": {"_id": "$category", "count": {"$sum": 1}}}
            ]
            category_results = self.aggregate(category_pipeline)
            
            # Count markets
            market_count = self.markets.count_documents({})
            
            # Count in-play events
            in_play_count = self.count({"in_play": True})
            
            # Format results
            status_counts = {result['_id']: result['count'] for result in status_results}
            category_counts = {result['_id']: result['count'] for result in category_results}
            
            return {
                'total_events': self.count(),
                'active_events': status_counts.get(Event.STATUS_OPEN, 0),
                'in_play_events': in_play_count,
                'total_markets': market_count,
                'events_by_status': status_counts,
                'events_by_category': category_counts
            }
        except Exception as e:
            self.logger.error(f"Error getting event stats: {e}")
            return {
                'total_events': 0,
                'active_events': 0,
                'in_play_events': 0,
                'total_markets': 0,
                'events_by_status': {},
                'events_by_category': {}
            }

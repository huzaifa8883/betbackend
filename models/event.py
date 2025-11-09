"""Event model for the BetPro Backend application.

This module provides the Event model class for representing betting events
from the Betfair API.
"""
from datetime import datetime
from bson import ObjectId
from models.base import BaseModel

class Event(BaseModel):
    """Event model for betting events."""
    
    # Event status constants
    STATUS_OPEN = 'OPEN'
    STATUS_SUSPENDED = 'SUSPENDED'
    STATUS_CLOSED = 'CLOSED'
    STATUS_INACTIVE = 'INACTIVE'
    
    def __init__(self, event_id, name, country_code=None, timezone=None, 
                 venue=None, open_date=None, market_count=0, status='OPEN',
                 competition=None, competition_id=None, category=None, category_id=None,
                 in_play=False, betfair_id=None, markets=None,
                 _id=None, created_at=None, updated_at=None):
        """Initialize an event object."""
        # Initialize the base model
        super().__init__(_id, created_at, updated_at)
        
        # Event specific attributes
        self.event_id = event_id  # Unique event ID (from Betfair)
        self.betfair_id = betfair_id or event_id  # For compatibility
        self.name = name
        self.country_code = country_code
        self.timezone = timezone
        self.venue = venue
        self.open_date = open_date
        self.market_count = market_count
        self.status = status
        self.competition = competition
        self.competition_id = competition_id
        self.category = category  # e.g., "Soccer", "Tennis"
        self.category_id = category_id
        self.in_play = in_play
        self.markets = markets or []  # List of market IDs associated with this event
    
    def is_active(self):
        """Check if the event is active."""
        return self.status == self.STATUS_OPEN
    
    def is_in_play(self):
        """Check if the event is currently in play."""
        return self.in_play
    
    def add_market(self, market_id):
        """Add a market to this event."""
        if market_id not in self.markets:
            self.markets.append(market_id)
            self.market_count = len(self.markets)
            self.updated_at = datetime.utcnow()
    
    def remove_market(self, market_id):
        """Remove a market from this event."""
        if market_id in self.markets:
            self.markets.remove(market_id)
            self.market_count = len(self.markets)
            self.updated_at = datetime.utcnow()


class Market(BaseModel):
    """Market model for betting markets within events."""
    
    # Market status constants
    STATUS_OPEN = 'OPEN'
    STATUS_SUSPENDED = 'SUSPENDED'
    STATUS_CLOSED = 'CLOSED'
    STATUS_INACTIVE = 'INACTIVE'
    
    # Market types
    TYPE_MATCH_ODDS = 'MATCH_ODDS'
    TYPE_OVER_UNDER = 'OVER_UNDER'
    TYPE_CORRECT_SCORE = 'CORRECT_SCORE'
    TYPE_ASIAN_HANDICAP = 'ASIAN_HANDICAP'
    
    def __init__(self, market_id, name, event_id, market_type=None, 
                 total_matched=0, status='OPEN', in_play=False,
                 start_time=None, selections=None, betfair_id=None,
                 _id=None, created_at=None, updated_at=None):
        """Initialize a market object."""
        # Initialize the base model
        super().__init__(_id, created_at, updated_at)
        
        # Market specific attributes
        self.market_id = market_id  # Unique market ID (from Betfair)
        self.betfair_id = betfair_id or market_id  # For compatibility
        self.name = name
        self.event_id = event_id  # Reference to the parent event
        self.market_type = market_type
        self.total_matched = total_matched
        self.status = status
        self.in_play = in_play
        self.start_time = start_time
        self.selections = selections or []  # List of selection objects
    
    def is_active(self):
        """Check if the market is active."""
        return self.status == self.STATUS_OPEN
    
    def is_in_play(self):
        """Check if the market is currently in play."""
        return self.in_play
    
    def add_selection(self, selection):
        """Add a selection to this market."""
        # Check if selection with same ID already exists
        for i, existing in enumerate(self.selections):
            if existing.get('selection_id') == selection.get('selection_id'):
                # Update existing selection
                self.selections[i] = selection
                self.updated_at = datetime.utcnow()
                return
        
        # Add new selection
        self.selections.append(selection)
        self.updated_at = datetime.utcnow()
    
    def get_selection(self, selection_id):
        """Get a selection by ID."""
        for selection in self.selections:
            if selection.get('selection_id') == selection_id:
                return selection
        return None

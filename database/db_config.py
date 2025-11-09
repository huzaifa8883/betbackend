"""
Database Configuration

Shared database configuration for the Python backend.
"""

# Database configuration
DATABASE_NAME = "betpro"

# Collection names
COLLECTIONS = {
    "USERS": "users",  # Using lowercase 'users' collection
    "TRANSACTIONS": "transactions",
    "BETS": "bets",
    "EVENTS": "events",
    "MARKETS": "markets",
    "SETTINGS": "settings"
}

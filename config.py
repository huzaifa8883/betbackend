"""
Configuration settings for the BetPro Backend application.
Loads environment variables and provides configuration classes for different environments.
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    """Base configuration class with common settings."""
    SECRET_KEY = os.getenv('SECRET_KEY', 'default-dev-key-change-in-production')
    DEBUG = False
    TESTING = False
    MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb+srv://huzaifa:huzaifa56567@cluster0.zvcyftu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
    
    # Betfair API settings
    BETFAIR_APP_KEY = os.getenv('BETFAIR_APP_KEY')
    BETFAIR_SESSION_TOKEN = os.getenv('BETFAIR_SESSION_TOKEN')
    
    # Session settings
    SESSION_TYPE = 'filesystem'
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = 86400  # 24 hours in seconds
    
    # Cache settings
    CACHE_TYPE = 'SimpleCache'
    CACHE_DEFAULT_TIMEOUT = 300  # 5 minutes

class DevelopmentConfig(Config):
    """Development environment configuration."""
    DEBUG = True
    
class TestingConfig(Config):
    """Testing environment configuration."""
    DEBUG = True
    TESTING = True
    MONGODB_URI = os.getenv('TEST_MONGODB_URI', 'mongodb+srv://alsexch247:mongo2025@cluster0.zvcyftu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')

class ProductionConfig(Config):
    """Production environment configuration."""
    # In production, ensure all required environment variables are set
    @classmethod
    def init_app(cls, app):
        # Log to stderr in production
        import logging
        from logging import StreamHandler
        file_handler = StreamHandler()
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)

# Dictionary with different configuration environments
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

# Get configuration based on environment
def get_config():
    """Return the appropriate configuration class based on environment."""
    env = os.getenv('FLASK_ENV', 'development')
    return config.get(env, config['default'])

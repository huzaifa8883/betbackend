"""
BetPro Backend Application

Main application entry point that initializes and configures the Flask application,
registers blueprints, and sets up necessary extensions.
"""
import os
import json
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, session, redirect, url_for
from flask_cors import CORS
from flask_session import Session

# Use standard JSON encoder since Flask's JSONEncoder location varies by version
from json import JSONEncoder as BaseJSONEncoder

# Import configuration
from config import get_config

# Import database initialization
from database.db import init_db

# Import API modules
from api.betfair_api import BetfairAPI

# Custom JSON encoder to preserve field order
class CustomJSONEncoder(BaseJSONEncoder):
    def __init__(self, *args, **kwargs):
        kwargs['sort_keys'] = False
        super(CustomJSONEncoder, self).__init__(*args, **kwargs)

# Track if app has been initialized to prevent duplicate initializations in debug mode
_app_initialized = False

# Store initialized services to prevent duplicate initializations
_initialized_services = {}

# Store database connection to prevent duplicate connections
_db_connection = None

def create_app(config_name=None):
    """
    Application factory function that creates and configures the Flask app.
    
    Args:
        config_name: The configuration environment to use (development, testing, production)
        
    Returns:
        The configured Flask application
    """
    global _app_initialized, _initialized_services, _db_connection
    
    # Create Flask app
    app = Flask(__name__)
    
    # Load configuration
    config_obj = get_config()
    app.config.from_object(config_obj)
    
    # Store initialization status in app config to persist across reloads
    app.config['SERVICES_INITIALIZED'] = False
    
    # Set up extensions
    app.json_encoder = CustomJSONEncoder
    CORS(app, supports_credentials=True)
    Session(app)
    
    # Set up proper logging - only once
    from utils.logger import setup_logger
    setup_logger(app)
    
    # Initialize database only once and store the connection
    if _db_connection is None:
        _db_connection = init_db(app.config['MONGODB_URI'])
        app.logger.debug("Database connection initialized")
    else:
        app.logger.debug("Reusing existing database connection")
    
    # Initialize Betfair API only once
    if 'betfair_api' not in _initialized_services:
        betfair_api = BetfairAPI(
            app_key=app.config['BETFAIR_APP_KEY'],
            session_token=app.config['BETFAIR_SESSION_TOKEN']
        )
        _initialized_services['betfair_api'] = betfair_api
        app.logger.debug("BetfairAPI initialized")
    else:
        betfair_api = _initialized_services['betfair_api']
        app.logger.debug("Reusing existing BetfairAPI instance")
    
    # Store the Betfair API client in app extensions
    app.extensions = {}
    app.extensions['betfair_api'] = betfair_api
    
    # Register error handlers
    from utils.error_handlers import register_error_handlers
    register_error_handlers(app)
    
    # Register blueprints - Flask handles duplicate registrations
    register_blueprints(app)
    
    # Register template filters
    register_template_filters(app)
    
    # Log application startup only once
    if not _app_initialized:
        app.logger.info(f"BetPro Backend started in {os.getenv('FLASK_ENV', 'development')} mode")
        _app_initialized = True
    else:
        app.logger.debug("Flask app reloaded due to code changes")
    
    return app

def register_blueprints(app):
    """Register all application blueprints."""
    # Only register blueprints once
    if app.config.get('BLUEPRINTS_REGISTERED'):
        app.logger.debug("Blueprints already registered, skipping")
        return
        
    app.logger.debug("Registering blueprints")
    
    # Import blueprints
    from api.auth import auth_bp
    from api.markets import markets_bp
    from api.bets import bets_bp
    from api.user import user_bp
    from api.mock_data import mock_data_bp
    from api.user_management import user_management_bp as user_management_api_bp
    from user_management import user_management_bp as user_management_web_bp
    from swagger import swagger_bp
    from dashboard import dashboard_bp
    
    # Register API blueprints
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(markets_bp, url_prefix='/api/Markets')
    app.register_blueprint(bets_bp, url_prefix='/api/bets')
    app.register_blueprint(user_bp, url_prefix='/api/user')
    app.register_blueprint(mock_data_bp, url_prefix='/api/mock')
    app.register_blueprint(user_management_api_bp, url_prefix='/api/user_management')
    
    # Register web blueprints
    app.register_blueprint(user_management_web_bp, url_prefix='/user')
    app.register_blueprint(dashboard_bp)
    
    # Register documentation
    app.register_blueprint(swagger_bp)
    
    # Mark blueprints as registered
    app.config['BLUEPRINTS_REGISTERED'] = True

def register_template_filters(app):
    """Register custom template filters at the application level."""
    # Import filter functions
    from dashboard import format_datetime
    
    # Register filters
    app.template_filter('datetime')(format_datetime)

# Create the application instance
app = create_app()

if __name__ == '__main__':
    # Run the application with reloader explicitly disabled
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, use_reloader=False)

# Add route redirects for lowercase 'markets' to uppercase 'Markets'
@app.route('/api/markets/Data')
@app.route('/api/markets/Data/')
def redirect_market_data():
    from flask import request, redirect
    return redirect(f"/api/Markets/Data?{request.query_string.decode()}")

@app.route('/api/markets/catalog2')
@app.route('/api/markets/catalog2/')
def redirect_market_catalog():
    from flask import request, redirect
    return redirect(f"/api/Markets/catalog2?{request.query_string.decode()}")

@app.route('/api/markets/catalogs')
@app.route('/api/markets/catalogs/')
def redirect_multiple_catalogs():
    from flask import request, redirect
    return redirect(f"/api/Markets/catalogs?{request.query_string.decode()}")

# Redirect root URL to dashboard
@app.route('/')
def index():
    return redirect(url_for('dashboard.index'))

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        "status": "error",
        "message": "Endpoint not found"
    }), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({
        "status": "error",
        "message": "Internal server error"
    }), 500

def clean_shutdown(signal_received=None, frame=None):
    """Handle clean shutdown of the application."""
    print("\n\nShutting down BetPro Backend...")
    # Close MongoDB connections if needed
    from database.db import close_db_connections
    close_db_connections()
    print("Database connections closed.")
    print("Server shutdown complete.\n")
    import sys
    sys.exit(0)

if __name__ == '__main__':
    # Register signal handlers for clean shutdown
    import signal
    signal.signal(signal.SIGINT, clean_shutdown)  # Ctrl+C
    signal.signal(signal.SIGTERM, clean_shutdown)  # Termination signal
    
    # Add explicit startup logging
    print("\n\n==== STARTING BETPRO BACKEND SERVER ====\n")
    print(f"Debug mode: {app.config['DEBUG']}")
    print(f"Host: {os.getenv('HOST', 'localhost')}")
    print(f"Port: {int(os.getenv('PORT', 5000))}")
    print("\n======================================\n\n")
    
    # Completely disable debug mode to avoid socket issues on Windows
    debug_mode = False
    
    try:
        # Run the application with simplified configuration
        app.run(
            host=os.getenv('HOST', 'localhost'),
            port=int(os.getenv('PORT', 5000)),
            debug=debug_mode,
            use_reloader=False,
            threaded=True
        )
    except KeyboardInterrupt:
        # Handle Ctrl+C gracefully
        clean_shutdown()
    except Exception as e:
        print(f"Error starting server: {e}")
        clean_shutdown()

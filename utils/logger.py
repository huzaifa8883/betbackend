"""
Logging configuration for the BetPro Backend application.

This module sets up logging with appropriate handlers and formatters
for different environments (development, testing, production).
"""
import os
import logging
from logging.handlers import RotatingFileHandler
import time

# Track if logger has been initialized to prevent duplicate handlers
_logger_initialized = False

def setup_logger(app):
    """
    Configure application logging based on environment.
    Uses a singleton pattern to prevent duplicate handlers when app reloads.
    
    Args:
        app: Flask application instance
    """
    global _logger_initialized
    
    # If logger is already initialized, just return it
    if _logger_initialized:
        return app.logger
    
    # Determine log level based on environment
    env = os.getenv('FLASK_ENV', 'development')
    is_production = env == 'production'
    
    # In production, use INFO level; in development, use DEBUG for app but INFO for requests
    log_level = logging.INFO if is_production else logging.DEBUG
    request_log_level = logging.INFO  # Less verbose for requests
    
    # Create logs directory if it doesn't exist
    log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    # Set up file handler for application logs
    log_file = os.path.join(log_dir, 'betpro.log')
    file_handler = RotatingFileHandler(log_file, maxBytes=10485760, backupCount=5)
    file_handler.setLevel(log_level)
    
    # Set up console handler for development
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    
    # Create formatter - simpler in production
    if is_production:
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
        )
    
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    # Remove existing handlers to prevent duplicates
    for handler in app.logger.handlers[:]: 
        app.logger.removeHandler(handler)
    
    # Add handlers to app logger
    app.logger.addHandler(file_handler)
    app.logger.addHandler(console_handler)
    app.logger.setLevel(log_level)
    
    # Set up request logging - more selective in what we log
    if not app.config['TESTING']:
        @app.before_request
        def before_request():
            from flask import request, g
            
            # Skip logging for static files and frequent health checks
            path = request.path
            if path.startswith('/static/') or path == '/health':
                return
                
            g.start_time = time.time()
            if request_log_level <= logging.DEBUG:  # Only log requests at DEBUG level
                app.logger.debug(f"Request: {request.method} {path}")
        
        @app.after_request
        def after_request(response):
            from flask import request, g
            
            # Skip logging for static files and frequent health checks
            path = request.path
            if path.startswith('/static/') or path == '/health':
                return response
                
            if hasattr(g, 'start_time'):
                elapsed = time.time() - g.start_time
                # Only log slow responses (>0.5s) or errors at INFO level
                if elapsed > 0.5 or response.status_code >= 400 or request_log_level <= logging.DEBUG:
                    app.logger.log(
                        logging.INFO if elapsed > 0.5 or response.status_code >= 400 else logging.DEBUG,
                        f"Response: {request.method} {path} - Status: {response.status_code} - Time: {elapsed:.4f}s"
                    )
            return response
    
    # Mark logger as initialized
    _logger_initialized = True
    
    # Log application startup
    app.logger.info(f"BetPro Backend logging initialized at level: {logging.getLevelName(log_level)}")
    
    return app.logger

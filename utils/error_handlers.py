"""
Error handling utilities for the BetPro Backend application.

This module provides custom error handlers and error classes to standardize
error responses across the application.
"""
from flask import jsonify, render_template
import logging

# Custom exception classes
class APIError(Exception):
    """Base class for API errors"""
    def __init__(self, message, status_code=400, payload=None):
        super().__init__()
        self.message = message
        self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        """Convert error to dictionary for JSON response"""
        error_dict = dict(self.payload or ())
        error_dict['message'] = self.message
        error_dict['status'] = 'error'
        error_dict['code'] = self.status_code
        return error_dict

class NotFoundError(APIError):
    """Resource not found error"""
    def __init__(self, message="Resource not found", payload=None):
        super().__init__(message, 404, payload)

class AuthenticationError(APIError):
    """Authentication error"""
    def __init__(self, message="Authentication failed", payload=None):
        super().__init__(message, 401, payload)

class AuthorizationError(APIError):
    """Authorization error"""
    def __init__(self, message="Not authorized", payload=None):
        super().__init__(message, 403, payload)

class ValidationError(APIError):
    """Validation error"""
    def __init__(self, message="Validation failed", payload=None):
        super().__init__(message, 422, payload)

class DatabaseError(APIError):
    """Database error"""
    def __init__(self, message="Database error", payload=None):
        super().__init__(message, 500, payload)

class BetfairAPIError(APIError):
    """Betfair API error"""
    def __init__(self, message="Betfair API error", payload=None):
        super().__init__(message, 502, payload)

# Error handlers
def register_error_handlers(app):
    """Register error handlers with the Flask application"""
    
    @app.errorhandler(APIError)
    def handle_api_error(error):
        """Handle custom API errors"""
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response
    
    @app.errorhandler(404)
    def not_found_error(error):
        """Handle 404 errors"""
        if request_wants_json():
            return jsonify({
                'status': 'error',
                'message': 'Resource not found',
                'code': 404
            }), 404
        return render_template('error.html', error_code=404, 
                              error_message="Page not found"), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        """Handle 500 errors"""
        logging.error(f"Internal server error: {str(error)}")
        if request_wants_json():
            return jsonify({
                'status': 'error',
                'message': 'Internal server error',
                'code': 500
            }), 500
        return render_template('error.html', error_code=500,
                              error_message="Internal server error"), 500

def request_wants_json():
    """Check if the request is expecting a JSON response"""
    from flask import request
    best = request.accept_mimetypes.best_match(['application/json', 'text/html'])
    return (best == 'application/json' and
            request.accept_mimetypes[best] > 
            request.accept_mimetypes['text/html'])

from flask import Blueprint, render_template, redirect, url_for, request, jsonify, g, current_app
from functools import wraps
import jwt
import os
import logging
from datetime import datetime
from services.user_service import UserService
from models.user import User

# Create blueprint
user_management_bp = Blueprint('user_management_web', __name__, url_prefix='/user')

# Initialize user service
user_service = UserService()

# Track initialization status
_user_management_initialized = False

# Authentication decorator for web routes
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get('auth_token')
        
        if not token:
            return redirect(url_for('user_management.login_page'))
        
        try:
            data = jwt.decode(token, os.environ.get('SECRET_KEY'), algorithms=['HS256'])
            current_user = user_service.get_user_by_id(data['user_id'])
            
            if not current_user:
                return redirect(url_for('user_management.login_page'))
                
            g.current_user = current_user
            
        except jwt.ExpiredSignatureError:
            return redirect(url_for('user_management.login_page'))
        except jwt.InvalidTokenError:
            return redirect(url_for('user_management.login_page'))
            
        return f(*args, **kwargs)
    
    return decorated

# Role-based access control decorator
def role_required(required_role):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, 'current_user'):
                return redirect(url_for('user_management.login_page'))
                
            if not g.current_user.has_role_permission(required_role):
                return render_template('error.html', 
                                      error_title="Access Denied", 
                                      error_message=f"You need {required_role.capitalize()} permissions to access this page.")
                
            return f(*args, **kwargs)
        return decorated
    return decorator

# Web routes
@user_management_bp.route('/login', methods=['GET'])
def login_page():
    return render_template('login.html', current_year=datetime.now().year)

@user_management_bp.route('/users', methods=['GET'])
@login_required
@role_required('master')
def users_page():
    return render_template('user_management.html', 
                          active_page='users',
                          current_user=g.current_user,
                          current_year=datetime.now().year)

@user_management_bp.route('/roles', methods=['GET'])
@login_required
@role_required('admin')
def roles_page():
    return render_template('user_management.html', 
                          active_page='roles',
                          current_user=g.current_user,
                          current_year=datetime.now().year)

@user_management_bp.route('/wallet', methods=['GET'])
@login_required
def wallet_page():
    return render_template('user_management.html', 
                          active_page='wallet',
                          current_user=g.current_user,
                          current_year=datetime.now().year)

@user_management_bp.route('/wallet/<user_id>', methods=['GET'])
@login_required
def user_wallet_page(user_id):
    # Check if current user can view this wallet
    target_user = user_service.get_user_by_id(user_id)
    
    if not target_user:
        return render_template('error.html', 
                              error_title="User Not Found", 
                              error_message="The requested user does not exist.")
    
    if str(g.current_user._id) != user_id and not g.current_user.can_manage(target_user):
        return render_template('error.html', 
                              error_title="Access Denied", 
                              error_message="You don't have permission to view this wallet.")
    
    return render_template('wallet.html', 
                          user=target_user,
                          current_user=g.current_user,
                          current_year=datetime.now().year)

@user_management_bp.route('/transactions', methods=['GET'])
@login_required
def transactions_page():
    return render_template('user_management.html', 
                          active_page='transactions',
                          current_user=g.current_user,
                          current_year=datetime.now().year)

# Helper function to create template context
def get_template_context(active_page):
    context = {
        'active_page': active_page,
        'current_year': datetime.now().year
    }
    
    if hasattr(g, 'current_user'):
        context['current_user'] = g.current_user
    
    return context

# Track initialization status using app.config to persist across module reloads

# Initialize the blueprint
def initialize():
    """Initialize the user management blueprint only once per application instance."""
    global _user_management_initialized
    
    # Skip initialization if already done
    if _user_management_initialized:
        return
        
    # Also check app config in case of app reloads
    if current_app.config.get('USER_MANAGEMENT_INITIALIZED', False):
        _user_management_initialized = True
        return
    
    # Initialize user service and create admin user
    try:
        # Use the already imported UserService (singleton)
        user_service.create_admin_user_if_not_exists()
        
        # Mark as initialized in both module and app config
        current_app.logger.info("User management blueprint initialized with admin user")
        current_app.config['USER_MANAGEMENT_INITIALIZED'] = True
        _user_management_initialized = True
    except Exception as e:
        current_app.logger.error(f"Error initializing user management: {str(e)}")

# Register the initialization function to run before the first request
# Use a request counter to ensure we only try to initialize once
_request_counter = 0

@user_management_bp.before_app_request
def initialize_on_request():
    global _request_counter
    
    # Only check on the first request to avoid repeated checks
    if _request_counter == 0:
        _request_counter += 1
        
        # Only initialize if not already initialized
        if not current_app.config.get('USER_MANAGEMENT_INITIALIZED', False):
            current_app.logger.debug("Initializing user management on first request")
            initialize()
        else:
            current_app.logger.debug("User management already initialized, skipping")

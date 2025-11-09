from flask import Blueprint, request, jsonify, current_app, g
import jwt
from functools import wraps
from bson import ObjectId
from services.user_service import UserService
import os
from datetime import datetime, timedelta
import logging

# Create blueprint
user_management_bp = Blueprint('user_management', __name__)

# Track initialization status
_api_initialized = False

# Initialize user service and logger - will be properly initialized on first use
logger = logging.getLogger('api.user_management')

# Lazy initialization of services
def get_user_service():
    global user_service, _api_initialized
    if not _api_initialized:
        user_service = UserService()
        logger.debug("API user management service initialized")
        _api_initialized = True
    return user_service

# Initialize placeholder for lazy loading
user_service = None

# Authentication decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Get token from header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({
                'success': False,
                'message': 'Token is missing!'
            }), 401
        
        try:
            # Decode token
            data = jwt.decode(token, os.environ.get('SECRET_KEY'), algorithms=['HS256'])
            current_user = get_user_service().get_user_by_id(data['user_id'])
            
            if not current_user:
                return jsonify({
                    'success': False,
                    'message': 'User not found!'
                }), 401
                
            # Add user to request context
            g.current_user = current_user
            
        except jwt.ExpiredSignatureError:
            return jsonify({
                'success': False,
                'message': 'Token has expired!'
            }), 401
        except jwt.InvalidTokenError:
            return jsonify({
                'success': False,
                'message': 'Invalid token!'
            }), 401
            
        return f(*args, **kwargs)
    
    return decorated

# Role-based access control decorator
def role_required(required_role):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            # First check if user is authenticated
            if not hasattr(g, 'current_user'):
                return jsonify({
                    'success': False,
                    'message': 'Authentication required!'
                }), 401
                
            # Check if user has required role
            if not g.current_user.has_role_permission(required_role):
                return jsonify({
                    'success': False,
                    'message': f'Access denied! {required_role.capitalize()} role required.'
                }), 403
                
            return f(*args, **kwargs)
        return decorated
    return decorator

# Routes

@user_management_bp.route('/login', methods=['POST'])
def login():
    """Login and get authentication token."""
    try:
        data = request.get_json()
        
        if not data or not data.get('username') or not data.get('password'):
            logger.warning(f"Login attempt with missing credentials from IP: {request.remote_addr}")
            return jsonify({
                'success': False,
                'message': 'Username and password are required!'
            }), 400
            
        # Use the service layer authenticate method
        user, error = get_user_service().authenticate(data['username'], data['password'])
        
        if not user:
            logger.warning(f"Failed login attempt for username: {data.get('username', 'unknown')} from IP: {request.remote_addr}")
            # Return a generic error message to avoid exposing implementation details
            return jsonify({
                'success': False,
                'message': 'Invalid username or password'
            }), 401
            
        # Generate token with appropriate expiration
        token_payload = {
            'user_id': str(user._id),
            'username': user.username,
            'role': user.role,
            'exp': datetime.utcnow() + timedelta(hours=24)
        }
        
        token = jwt.encode(token_payload, os.environ.get('SECRET_KEY'), algorithm='HS256')
        
        logger.info(f"Successful login for user: {user.username} (role: {user.role})")
        
        return jsonify({
            'success': True,
            'token': token,
            'user': user.to_safe_dict()
        }), 200
    except Exception as e:
        logger.error(f"Error in login endpoint: {str(e)}")
        # Return a generic error message to avoid exposing implementation details
        return jsonify({
            'success': False,
            'message': 'An error occurred during login. Please try again.'
        }), 500

@user_management_bp.route('/users', methods=['GET'])
@token_required
@role_required('master')
def get_users():
    """Get users based on role and hierarchy."""
    # Get query parameters
    role = request.args.get('role')
    parent_id = request.args.get('parent_id')
    skip = int(request.args.get('skip', 0))
    limit = int(request.args.get('limit', 20))
    
    current_user = g.current_user
    
    # If admin or supermaster, they can filter by role
    if role and current_user.has_role_permission('supermaster'):
        users = get_user_service().get_users_by_role(role, skip, limit)
    # Otherwise, get users by parent (users they created)
    elif current_user.has_role_permission('master'):
        # If parent_id is specified and user has permission to view that parent's users
        if parent_id and current_user.has_role_permission('supermaster'):
            users = get_user_service().get_users_by_parent(parent_id, skip, limit)
        else:
            # Default: get users created by current user
            users = get_user_service().get_users_by_parent(str(current_user._id), skip, limit)
    else:
        return jsonify({
            'success': False,
            'message': 'Access denied!'
        }), 403
    
    return jsonify({
        'success': True,
        'users': [user.to_safe_dict() for user in users],
        'count': len(users),
        'skip': skip,
        'limit': limit
    }), 200

@user_management_bp.route('/users/<user_id>', methods=['GET'])
@token_required
def get_user(user_id):
    """Get user details."""
    current_user = g.current_user
    
    # Users can view their own details
    if str(current_user._id) == user_id:
        user = current_user
    else:
        # Check if current user has permission to view this user
        target_user = get_user_service().get_user_by_id(user_id)
        if not target_user:
            return jsonify({
                'success': False,
                'message': 'User not found!'
            }), 404
            
        if not current_user.can_manage(target_user):
            return jsonify({
                'success': False,
                'message': 'Access denied!'
            }), 403
            
        user = target_user
    
    # Get user hierarchy if requested
    include_hierarchy = request.args.get('hierarchy', 'false').lower() == 'true'
    
    if include_hierarchy and current_user.has_role_permission('master'):
        hierarchy = get_user_service().get_user_hierarchy(user_id)
        # Add success field to the hierarchy response
        if isinstance(hierarchy, dict):
            hierarchy['success'] = True
        return jsonify(hierarchy), 200
    
    return jsonify({
        'success': True,
        'user': user.to_safe_dict()
    }), 200

@user_management_bp.route('/users', methods=['POST'])
@token_required
@role_required('master')
def create_user():
    """Create a new user."""
    data = request.get_json()
    current_user = g.current_user
    
    # Validate required fields
    required_fields = ['username', 'email', 'password', 'role']
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Field {field} is required!'}), 400
    
    # Check if current user can create a user with the specified role
    requested_role = data['role']
    if not current_user.has_role_permission(requested_role):
        return jsonify({
            'success': False,
            'message': f'You cannot create users with {requested_role} role!'
        }), 403
    
    # Set parent ID to current user
    data['parent_id'] = str(current_user._id)
    
    # Create user
    success, result = get_user_service().create_user(
        username=data['username'],
        email=data['email'],
        password=data['password'],
        role=data['role'],
        full_name=data.get('full_name'),
        phone=data.get('phone'),
        parent_id=data['parent_id'],
        initial_balance=float(data.get('initial_balance', 0.0))
    )
    
    if not success:
        return jsonify({'message': result}), 400
    
    return jsonify({
        'success': True,
        'message': 'User created successfully!',
        'user_id': result
    }), 201

@user_management_bp.route('/users/<user_id>', methods=['PUT'])
@token_required
def update_user(user_id):
    """Update user details."""
    data = request.get_json()
    current_user = g.current_user
    
    # Check if target user exists
    target_user = get_user_service().get_user_by_id(user_id)
    if not target_user:
        return jsonify({'message': 'User not found!'}), 404
    
    # Check if current user can update this user
    if str(current_user._id) != user_id and not current_user.can_manage(target_user):
        return jsonify({'message': 'Access denied!'}), 403
    
    # Users can't change their own role
    if str(current_user._id) == user_id and 'role' in data:
        return jsonify({'message': 'You cannot change your own role!'}), 403
    
    # Check if current user can assign the requested role
    if 'role' in data and not current_user.has_role_permission(data['role']):
        return jsonify({'message': f'You cannot assign {data["role"]} role!'}), 403
    
    # Update user
    success, result = get_user_service().update_user(user_id, data)
    
    if not success:
        return jsonify({'message': result}), 400
    
    return jsonify({
        'success': True,
        'message': result
    }), 200

@user_management_bp.route('/users/<user_id>', methods=['DELETE'])
@token_required
@role_required('supermaster')
def delete_user(user_id):
    """Deactivate a user."""
    current_user = g.current_user
    
    # Check if target user exists
    target_user = user_service.get_user_by_id(user_id)
    if not target_user:
        return jsonify({'message': 'User not found!'}), 404
    
    # Users can't delete themselves
    if str(current_user._id) == user_id:
        return jsonify({'message': 'You cannot delete your own account!'}), 403
    
    # Check if current user can delete this user
    if not current_user.can_manage(target_user):
        return jsonify({'message': 'Access denied!'}), 403
    
    # Delete (deactivate) user
    success, result = get_user_service().delete_user(user_id)
    
    if not success:
        return jsonify({'message': result}), 400
    
    return jsonify({
        'success': True,
        'message': result
    }), 200

@user_management_bp.route('/wallet/<user_id>', methods=['GET'])
@token_required
def get_wallet(user_id):
    """Get user wallet details and transactions."""
    current_user = g.current_user
    
    # Check if target user exists
    target_user = user_service.get_user_by_id(user_id)
    if not target_user:
        return jsonify({'message': 'User not found!'}), 404
    
    # Check if current user can view this user's wallet
    if str(current_user._id) != user_id and not current_user.can_manage(target_user):
        return jsonify({'message': 'Access denied!'}), 403
    
    # Get transactions
    skip = int(request.args.get('skip', 0))
    limit = int(request.args.get('limit', 20))
    transaction_type = request.args.get('type')
    
    transactions = get_user_service().get_user_transactions(
        user_id, skip, limit, transaction_type
    )
    
    return jsonify({
        'success': True,
        'wallet_balance': target_user.wallet_balance,
        'transactions': [t.to_dict() for t in transactions],
        'count': len(transactions),
        'skip': skip,
        'limit': limit
    }), 200

@user_management_bp.route('/wallet/<user_id>/update', methods=['POST'])
@token_required
@role_required('master')
def update_wallet(user_id):
    """Update user wallet balance."""
    data = request.get_json()
    current_user = g.current_user
    
    # Validate required fields
    required_fields = ['amount', 'type', 'description']
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Field {field} is required!'}), 400
    
    # Check if target user exists
    target_user = user_service.get_user_by_id(user_id)
    if not target_user:
        return jsonify({'message': 'User not found!'}), 404
    
    # Check if current user can update this user's wallet
    if not current_user.can_manage(target_user):
        return jsonify({'message': 'Access denied!'}), 403
    
    # Update wallet balance
    success, result = get_user_service().update_wallet_balance(
        user_id=user_id,
        amount=data['amount'],
        transaction_type=data['type'],
        description=data['description'],
        created_by=str(current_user._id)
    )
    
    if not success:
        return jsonify({'message': result}), 400
    
    # Ensure we return a standardized response with success field
    if isinstance(result, dict):
        result['success'] = True
        return jsonify(result), 200
    else:
        return jsonify({
            'success': True,
            'message': 'Wallet updated successfully',
            'result': result
        }), 200

@user_management_bp.route('/dashboard/stats', methods=['GET'])
@token_required
@role_required('admin')
def get_dashboard_stats():
    """Get user statistics for dashboard."""
    # Count users by role
    role_counts = get_user_service().count_users_by_role()
    
    # Get recent users
    recent_users = get_user_service().get_users_by_role('user', 0, 5)
    
    return jsonify({
        'success': True,
        'user_counts': role_counts,
        'recent_users': [user.to_safe_dict() for user in recent_users]
    }), 200

@user_management_bp.route('/logout', methods=['POST'])
@token_required
def logout():
    """Logout the current user.
    
    This endpoint handles server-side logout operations such as token invalidation.
    The actual token removal from client storage is handled by frontend JavaScript.
    """
    try:
        # Get current user from request context
        current_user = g.current_user
        
        # Log the logout event
        logger.info(f"User logged out: {current_user.username} (role: {current_user.role}) from IP: {request.remote_addr}")
        
        # In the future, we could implement token blacklisting here
        # For now, we just return a success message as the actual token removal
        # is handled by the frontend JavaScript
        
        return jsonify({
            'success': True,
            'message': 'Logout successful'
        }), 200
    except Exception as e:
        logger.error(f"Error in logout endpoint: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'An error occurred during logout. Please try again.'
        }), 500

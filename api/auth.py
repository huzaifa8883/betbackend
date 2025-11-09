from flask import Blueprint, request, jsonify, current_app
import jwt
import bcrypt
from datetime import datetime, timedelta
from functools import wraps
from database.db import get_db
from database.db_config import COLLECTIONS

auth_bp = Blueprint('auth', __name__)

def token_required(f):
    """Decorator for endpoints that require authentication"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check if token is in headers
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({
                'status': 'error',
                'message': 'Token is missing'
            }), 401
        
        try:
            # Decode token
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = get_db().users.find_one({'_id': data['user_id']})
            
            if not current_user:
                return jsonify({
                    'status': 'error',
                    'message': 'User not found'
                }), 401
                
        except jwt.ExpiredSignatureError:
            return jsonify({
                'status': 'error',
                'message': 'Token has expired'
            }), 401
        except jwt.InvalidTokenError:
            return jsonify({
                'status': 'error',
                'message': 'Invalid token'
            }), 401
            
        return f(current_user, *args, **kwargs)
    
    return decorated

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['username', 'password', 'email', 'full_name']
    for field in required_fields:
        if field not in data:
            return jsonify({
                'status': 'error',
                'message': f'Missing required field: {field}'
            }), 400
    
    db = get_db()
    
    # Check if username already exists
    if db[COLLECTIONS['USERS']].find_one({'username': data['username']}):
        return jsonify({
            'status': 'error',
            'message': 'Username already exists'
        }), 400
    
    # Check if email already exists
    if db[COLLECTIONS['USERS']].find_one({'email': data['email']}):
        return jsonify({
            'status': 'error',
            'message': 'Email already exists'
        }), 400
    
    # Hash password
    hashed_password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt())
    
    # Create user
    user = {
        'username': data['username'],
        'password': hashed_password,
        'email': data['email'],
        'full_name': data['full_name'],
        'balance': 0.0,  # Initial balance
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
        'role': 'user',  # Default role
        'status': 'active'  # Default status
    }
    
    # Insert user into database
    result = db[COLLECTIONS['USERS']].insert_one(user)
    
    # Generate token
    token = jwt.encode({
        'user_id': str(result.inserted_id),
        'username': user['username'],
        'exp': datetime.utcnow() + timedelta(days=1)
    }, current_app.config['SECRET_KEY'])
    
    return jsonify({
        'status': 'success',
        'message': 'User registered successfully',
        'token': token,
        'user': {
            'id': str(result.inserted_id),
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'balance': user['balance'],
            'role': user['role']
        }
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user"""
    data = request.get_json()
    
    # Validate required fields
    if 'username' not in data or 'password' not in data:
        return jsonify({
            'status': 'error',
            'message': 'Username and password are required'
        }), 400
    
    db = get_db()
    
    # Find user by username
    user = db[COLLECTIONS['USERS']].find_one({'username': data['username']})
    
    if not user:
        return jsonify({
            'status': 'error',
            'message': 'Invalid username or password'
        }), 401
    
    # Check password
    if not bcrypt.checkpw(data['password'].encode('utf-8'), user['password']):
        return jsonify({
            'status': 'error',
            'message': 'Invalid username or password'
        }), 401
    
    # Check if user is active
    if user['status'] != 'active':
        return jsonify({
            'status': 'error',
            'message': 'Account is not active'
        }), 401
    
    # Generate token
    token = jwt.encode({
        'user_id': str(user['_id']),
        'username': user['username'],
        'exp': datetime.utcnow() + timedelta(days=1)
    }, current_app.config['SECRET_KEY'])
    
    return jsonify({
        'status': 'success',
        'message': 'Login successful',
        'token': token,
        'user': {
            'id': str(user['_id']),
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'balance': user['balance'],
            'role': user['role']
        }
    }), 200

@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout(current_user):
    """Logout user - client-side token removal"""
    return jsonify({
        'status': 'success',
        'message': 'Logout successful'
    }), 200

@auth_bp.route('/me', methods=['GET'])
@token_required
def me(current_user):
    """Get current user info"""
    return jsonify({
        'status': 'success',
        'user': {
            'id': str(current_user['_id']),
            'username': current_user['username'],
            'email': current_user['email'],
            'full_name': current_user['full_name'],
            'balance': current_user['balance'],
            'role': current_user['role']
        }
    }), 200

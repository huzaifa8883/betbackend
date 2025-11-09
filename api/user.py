from flask import Blueprint, request, jsonify, current_app
from api.auth import token_required
from database.db import get_db
import logging
from datetime import datetime
import bcrypt
from bson.objectid import ObjectId

user_bp = Blueprint('user', __name__)

@user_bp.route('/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    """Get user profile"""
    try:
        return jsonify({
            'status': 'success',
            'data': {
                'id': str(current_user['_id']),
                'username': current_user['username'],
                'email': current_user['email'],
                'full_name': current_user['full_name'],
                'balance': current_user['balance'],
                'role': current_user['role'],
                'created_at': current_user['created_at']
            }
        }), 200
    except Exception as e:
        logging.error(f"Error getting user profile: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get user profile'
        }), 500

@user_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile(current_user):
    """Update user profile"""
    try:
        data = request.get_json()
        
        # Fields that can be updated
        allowed_fields = ['full_name', 'email']
        update_data = {}
        
        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]
        
        if not update_data:
            return jsonify({
                'status': 'error',
                'message': 'No valid fields to update'
            }), 400
        
        # Add updated_at timestamp
        update_data['updated_at'] = datetime.utcnow()
        
        # Update user in database
        db = get_db()
        db.users.update_one(
            {'_id': current_user['_id']},
            {'$set': update_data}
        )
        
        # Get updated user
        updated_user = db.users.find_one({'_id': current_user['_id']})
        
        return jsonify({
            'status': 'success',
            'message': 'Profile updated successfully',
            'data': {
                'id': str(updated_user['_id']),
                'username': updated_user['username'],
                'email': updated_user['email'],
                'full_name': updated_user['full_name'],
                'balance': updated_user['balance'],
                'role': updated_user['role']
            }
        }), 200
    except Exception as e:
        logging.error(f"Error updating user profile: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to update user profile'
        }), 500

@user_bp.route('/change-password', methods=['PUT'])
@token_required
def change_password(current_user):
    """Change user password"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['current_password', 'new_password']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'message': f'Missing required field: {field}'
                }), 400
        
        # Validate current password
        if not bcrypt.checkpw(data['current_password'].encode('utf-8'), current_user['password']):
            return jsonify({
                'status': 'error',
                'message': 'Current password is incorrect'
            }), 400
        
        # Validate new password
        if len(data['new_password']) < 6:
            return jsonify({
                'status': 'error',
                'message': 'New password must be at least 6 characters'
            }), 400
        
        # Hash new password
        hashed_password = bcrypt.hashpw(data['new_password'].encode('utf-8'), bcrypt.gensalt())
        
        # Update password in database
        db = get_db()
        db.users.update_one(
            {'_id': current_user['_id']},
            {'$set': {
                'password': hashed_password,
                'updated_at': datetime.utcnow()
            }}
        )
        
        return jsonify({
            'status': 'success',
            'message': 'Password changed successfully'
        }), 200
    except Exception as e:
        logging.error(f"Error changing password: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to change password'
        }), 500

@user_bp.route('/balance', methods=['GET'])
@token_required
def get_balance(current_user):
    """Get user balance"""
    try:
        db = get_db()
        user = db.users.find_one({'_id': current_user['_id']})
        
        return jsonify({
            'status': 'success',
            'data': {
                'balance': user['balance']
            }
        }), 200
    except Exception as e:
        logging.error(f"Error getting user balance: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get user balance'
        }), 500

@user_bp.route('/transactions', methods=['GET'])
@token_required
def get_transactions(current_user):
    """Get user transactions"""
    try:
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        
        db = get_db()
        
        # Get transactions
        transactions = list(db.transactions.find(
            {'user_id': current_user['_id']}
        ).sort('created_at', -1).skip(offset).limit(limit))
        
        # Format transactions
        formatted_transactions = []
        for transaction in transactions:
            formatted_transactions.append({
                'id': str(transaction['_id']),
                'type': transaction['type'],
                'amount': transaction['amount'],
                'balance_before': transaction['balance_before'],
                'balance_after': transaction['balance_after'],
                'description': transaction['description'],
                'status': transaction['status'],
                'created_at': transaction['created_at']
            })
        
        # Get total count
        total = db.transactions.count_documents({'user_id': current_user['_id']})
        
        return jsonify({
            'status': 'success',
            'data': formatted_transactions,
            'pagination': {
                'total': total,
                'limit': limit,
                'offset': offset
            }
        }), 200
    except Exception as e:
        logging.error(f"Error getting user transactions: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get user transactions'
        }), 500

@user_bp.route('/deposit', methods=['POST'])
@token_required
def deposit(current_user):
    """Deposit funds to user account"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if 'amount' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Amount is required'
            }), 400
        
        # Validate amount
        try:
            amount = float(data['amount'])
            if amount <= 0:
                return jsonify({
                    'status': 'error',
                    'message': 'Amount must be positive'
                }), 400
        except ValueError:
            return jsonify({
                'status': 'error',
                'message': 'Amount must be a valid number'
            }), 400
        
        db = get_db()
        user = db.users.find_one({'_id': current_user['_id']})
        
        # Create transaction
        transaction = {
            'user_id': user['_id'],
            'type': 'DEPOSIT',
            'amount': amount,
            'balance_before': user['balance'],
            'balance_after': user['balance'] + amount,
            'description': data.get('description', 'Deposit'),
            'status': 'COMPLETED',
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        # Insert transaction
        db.transactions.insert_one(transaction)
        
        # Update user balance
        db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'balance': amount}}
        )
        
        # Get updated user
        updated_user = db.users.find_one({'_id': user['_id']})
        
        return jsonify({
            'status': 'success',
            'message': 'Deposit successful',
            'data': {
                'balance': updated_user['balance']
            }
        }), 200
    except Exception as e:
        logging.error(f"Error depositing funds: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to deposit funds'
        }), 500

@user_bp.route('/withdraw', methods=['POST'])
@token_required
def withdraw(current_user):
    """Withdraw funds from user account"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if 'amount' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Amount is required'
            }), 400
        
        # Validate amount
        try:
            amount = float(data['amount'])
            if amount <= 0:
                return jsonify({
                    'status': 'error',
                    'message': 'Amount must be positive'
                }), 400
        except ValueError:
            return jsonify({
                'status': 'error',
                'message': 'Amount must be a valid number'
            }), 400
        
        db = get_db()
        user = db.users.find_one({'_id': current_user['_id']})
        
        # Check if user has enough balance
        if user['balance'] < amount:
            return jsonify({
                'status': 'error',
                'message': 'Insufficient balance'
            }), 400
        
        # Create transaction
        transaction = {
            'user_id': user['_id'],
            'type': 'WITHDRAWAL',
            'amount': amount,
            'balance_before': user['balance'],
            'balance_after': user['balance'] - amount,
            'description': data.get('description', 'Withdrawal'),
            'status': 'COMPLETED',
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        # Insert transaction
        db.transactions.insert_one(transaction)
        
        # Update user balance
        db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'balance': -amount}}
        )
        
        # Get updated user
        updated_user = db.users.find_one({'_id': user['_id']})
        
        return jsonify({
            'status': 'success',
            'message': 'Withdrawal successful',
            'data': {
                'balance': updated_user['balance']
            }
        }), 200
    except Exception as e:
        logging.error(f"Error withdrawing funds: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to withdraw funds'
        }), 500

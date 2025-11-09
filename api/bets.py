from flask import Blueprint, request, jsonify, current_app
from api.auth import token_required
from database.db import get_db
import logging
from datetime import datetime
from bson.objectid import ObjectId

bets_bp = Blueprint('bets', __name__)

# Get Betfair API instance from app context
def get_betfair_api():
    return current_app.extensions.get('betfair_api')

@bets_bp.route('/place', methods=['POST'])
@token_required
def place_bet(current_user):
    """Place a bet"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['market_id', 'selection_id', 'side', 'price', 'size']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'message': f'Missing required field: {field}'
                }), 400
        
        # Validate side
        if data['side'].upper() not in ['BACK', 'LAY']:
            return jsonify({
                'status': 'error',
                'message': 'Side must be either BACK or LAY'
            }), 400
        
        # Validate price and size
        try:
            price = float(data['price'])
            size = float(data['size'])
            
            if price <= 0 or size <= 0:
                return jsonify({
                    'status': 'error',
                    'message': 'Price and size must be positive numbers'
                }), 400
        except ValueError:
            return jsonify({
                'status': 'error',
                'message': 'Price and size must be valid numbers'
            }), 400
        
        # Check if user has enough balance
        db = get_db()
        user = db.users.find_one({'_id': current_user['_id']})
        
        if not user:
            return jsonify({
                'status': 'error',
                'message': 'User not found'
            }), 404
        
        # Calculate liability
        liability = size
        if data['side'].upper() == 'LAY':
            liability = size * (price - 1)
        
        if user['balance'] < liability:
            return jsonify({
                'status': 'error',
                'message': 'Insufficient balance'
            }), 400
        
        # Place bet with Betfair API
        betfair_api = get_betfair_api()
        customer_ref = f"user_{str(user['_id'])}_{datetime.utcnow().timestamp()}"
        
        result = betfair_api.place_bet(
            market_id=data['market_id'],
            selection_id=data['selection_id'],
            side=data['side'],
            price=price,
            size=size,
            customer_ref=customer_ref
        )
        
        if result['status'] != 'success':
            return jsonify({
                'status': 'error',
                'message': f"Failed to place bet: {result.get('error', 'Unknown error')}"
            }), 400
        
        # Save bet to database
        bet = {
            'user_id': user['_id'],
            'market_id': data['market_id'],
            'selection_id': data['selection_id'],
            'side': data['side'].upper(),
            'price': price,
            'size': size,
            'liability': liability,
            'bet_id': result.get('bet_id'),
            'placed_date': result.get('placed_date') or datetime.utcnow(),
            'average_price_matched': result.get('average_price_matched'),
            'size_matched': result.get('size_matched', 0),
            'status': 'MATCHED' if result.get('size_matched', 0) > 0 else 'UNMATCHED',
            'profit_loss': None,  # Will be updated when bet is settled
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        bet_id = db.bets.insert_one(bet).inserted_id
        
        # Update user balance - reserve the liability
        db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'balance': -liability}}
        )
        
        # Get updated user
        updated_user = db.users.find_one({'_id': user['_id']})
        
        return jsonify({
            'status': 'success',
            'message': 'Bet placed successfully',
            'bet': {
                'id': str(bet_id),
                'market_id': bet['market_id'],
                'selection_id': bet['selection_id'],
                'side': bet['side'],
                'price': bet['price'],
                'size': bet['size'],
                'liability': bet['liability'],
                'bet_id': bet['bet_id'],
                'placed_date': bet['placed_date'],
                'status': bet['status']
            },
            'user': {
                'balance': updated_user['balance']
            }
        }), 201
    except Exception as e:
        logging.error(f"Error placing bet: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to place bet'
        }), 500

@bets_bp.route('/cancel/<bet_id>', methods=['POST'])
@token_required
def cancel_bet(current_user, bet_id):
    """Cancel a bet"""
    try:
        db = get_db()
        
        # Find bet in database
        bet = db.bets.find_one({
            '_id': ObjectId(bet_id),
            'user_id': current_user['_id']
        })
        
        if not bet:
            return jsonify({
                'status': 'error',
                'message': 'Bet not found'
            }), 404
        
        # Check if bet can be cancelled
        if bet['status'] not in ['UNMATCHED', 'PARTIALLY_MATCHED']:
            return jsonify({
                'status': 'error',
                'message': f"Cannot cancel bet with status: {bet['status']}"
            }), 400
        
        # Cancel bet with Betfair API
        betfair_api = get_betfair_api()
        
        result = betfair_api.cancel_bet(
            bet_id=bet['bet_id'],
            market_id=bet['market_id']
        )
        
        if result['status'] != 'success':
            return jsonify({
                'status': 'error',
                'message': f"Failed to cancel bet: {result.get('error', 'Unknown error')}"
            }), 400
        
        # Update bet status in database
        db.bets.update_one(
            {'_id': bet['_id']},
            {'$set': {
                'status': 'CANCELLED',
                'cancelled_date': result.get('cancelled_date') or datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }}
        )
        
        # Return liability to user balance
        remaining_liability = bet['liability']
        if bet['status'] == 'PARTIALLY_MATCHED':
            # Calculate remaining liability for partially matched bets
            matched_liability = bet['size_matched'] * (bet['price'] - 1) if bet['side'] == 'LAY' else bet['size_matched']
            remaining_liability = bet['liability'] - matched_liability
        
        db.users.update_one(
            {'_id': current_user['_id']},
            {'$inc': {'balance': remaining_liability}}
        )
        
        # Get updated user
        updated_user = db.users.find_one({'_id': current_user['_id']})
        
        return jsonify({
            'status': 'success',
            'message': 'Bet cancelled successfully',
            'user': {
                'balance': updated_user['balance']
            }
        }), 200
    except Exception as e:
        logging.error(f"Error cancelling bet: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to cancel bet'
        }), 500

@bets_bp.route('/list', methods=['GET'])
@token_required
def list_bets(current_user):
    """List user bets"""
    try:
        status = request.args.get('status')
        market_id = request.args.get('market_id')
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        
        # Build query
        query = {'user_id': current_user['_id']}
        
        if status:
            query['status'] = status.upper()
        
        if market_id:
            query['market_id'] = market_id
        
        db = get_db()
        
        # Get bets
        bets = list(db.bets.find(query).sort('created_at', -1).skip(offset).limit(limit))
        
        # Format bets
        formatted_bets = []
        for bet in bets:
            formatted_bets.append({
                'id': str(bet['_id']),
                'market_id': bet['market_id'],
                'selection_id': bet['selection_id'],
                'side': bet['side'],
                'price': bet['price'],
                'size': bet['size'],
                'liability': bet['liability'],
                'bet_id': bet['bet_id'],
                'placed_date': bet['placed_date'],
                'status': bet['status'],
                'profit_loss': bet['profit_loss'],
                'created_at': bet['created_at']
            })
        
        # Get total count
        total = db.bets.count_documents(query)
        
        return jsonify({
            'status': 'success',
            'data': formatted_bets,
            'pagination': {
                'total': total,
                'limit': limit,
                'offset': offset
            }
        }), 200
    except Exception as e:
        logging.error(f"Error listing bets: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to list bets'
        }), 500

@bets_bp.route('/<bet_id>', methods=['GET'])
@token_required
def get_bet(current_user, bet_id):
    """Get bet details"""
    try:
        db = get_db()
        
        # Find bet in database
        bet = db.bets.find_one({
            '_id': ObjectId(bet_id),
            'user_id': current_user['_id']
        })
        
        if not bet:
            return jsonify({
                'status': 'error',
                'message': 'Bet not found'
            }), 404
        
        # Format bet
        formatted_bet = {
            'id': str(bet['_id']),
            'market_id': bet['market_id'],
            'selection_id': bet['selection_id'],
            'side': bet['side'],
            'price': bet['price'],
            'size': bet['size'],
            'liability': bet['liability'],
            'bet_id': bet['bet_id'],
            'placed_date': bet['placed_date'],
            'status': bet['status'],
            'profit_loss': bet['profit_loss'],
            'created_at': bet['created_at']
        }
        
        return jsonify({
            'status': 'success',
            'data': formatted_bet
        }), 200
    except Exception as e:
        logging.error(f"Error getting bet: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get bet'
        }), 500

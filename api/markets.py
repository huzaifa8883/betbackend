from flask import Blueprint, request, jsonify, current_app
from api.auth import token_required
from database.db import get_db
import logging
import json
from datetime import datetime
from betfairlightweight import filters
import uuid
from bson.json_util import dumps, loads
from collections import OrderedDict

# Helper function to safely access attributes or keys
def safe_get(obj, key, default=None):
    """Safely get a value from an object or dictionary
    
    Args:
        obj: The object or dictionary to get the value from
        key: The key or attribute name to get
        default: The default value to return if the key/attribute is not found
        
    Returns:
        The value of the key/attribute or the default value
    """
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    elif hasattr(obj, key):
        return getattr(obj, key, default)
    else:
        return default
        
# Alias for backward compatibility
_safe_get_attr = safe_get

markets_bp = Blueprint('markets', __name__)

# Get Betfair API instance from app context
def get_betfair_api():
    # Try to get from app extensions
    api = current_app.extensions.get('betfair_api')
    
    # If not found, create a new instance as fallback
    if api is None:
        from api.betfair_api import BetfairAPI
        import os
        logging.warning("Betfair API not found in app extensions, creating new instance")
        api = BetfairAPI(
            app_key=os.getenv('BETFAIR_APP_KEY'),
            session_token=os.getenv('BETFAIR_SESSION_TOKEN')
        )
        # Store for future use
        if not hasattr(current_app, 'extensions') or current_app.extensions is None:
            current_app.extensions = {}
        current_app.extensions['betfair_api'] = api
    
    return api

@markets_bp.route('/sports', methods=['GET'])
def get_sports():
    """Get all sports (event types)"""
    try:
        betfair_api = get_betfair_api()
        sports = betfair_api.get_event_types()
        
        # Cache sports in database for faster access
        db = get_db()
        for sport in sports:
            db.sports.update_one(
                {'id': sport['id']},
                {'$set': {
                    'name': sport['name'],
                    'updated_at': datetime.utcnow()
                }},
                upsert=True
            )
        
        return jsonify({
            'status': 'success',
            'data': sports
        }), 200
    except Exception as e:
        logging.error(f"Error getting sports: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get sports'
        }), 500

@markets_bp.route('/competitions', methods=['GET'])
def get_competitions():
    """Get competitions for a specific sport"""
    try:
        event_type_id = request.args.get('sport_id')
        
        betfair_api = get_betfair_api()
        competitions = betfair_api.get_competitions(event_type_id)
        
        # Cache competitions in database
        db = get_db()
        for competition in competitions:
            db.competitions.update_one(
                {'id': competition['id']},
                {'$set': {
                    'name': competition['name'],
                    'region': competition['region'],
                    'sport_id': event_type_id,
                    'updated_at': datetime.utcnow()
                }},
                upsert=True
            )
        
        return jsonify({
            'status': 'success',
            'data': competitions
        }), 200
    except Exception as e:
        logging.error(f"Error getting competitions: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get competitions'
        }), 500

@markets_bp.route('/events', methods=['GET'])
def get_events():
    """Get events for a specific sport or competition"""
    try:
        event_type_id = request.args.get('sport_id')
        competition_id = request.args.get('competition_id')
        
        betfair_api = get_betfair_api()
        events = betfair_api.get_events(event_type_id, competition_id)
        
        # Cache events in database
        db = get_db()
        for event in events:
            db.events.update_one(
                {'id': event['id']},
                {'$set': {
                    'name': event['name'],
                    'country_code': event.get('country_code'),
                    'timezone': event.get('timezone'),
                    'open_date': event.get('open_date'),
                    'sport_id': event_type_id,
                    'competition_id': competition_id,
                    'updated_at': datetime.utcnow()
                }},
                upsert=True
            )
        
        return jsonify({
            'status': 'success',
            'data': events
        }), 200
    except Exception as e:
        logging.error(f"Error getting events: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get events'
        }), 500

@markets_bp.route('/markets', methods=['GET'])
def get_markets():
    """Get markets for a specific event"""
    try:
        event_id = request.args.get('event_id')
        market_types = request.args.get('market_types')
        
        if market_types:
            market_types = market_types.split(',')
        
        betfair_api = get_betfair_api()
        markets = betfair_api.get_markets(event_id, market_types)
        
        # Cache markets in database
        db = get_db()
        for market in markets:
            db.markets.update_one(
                {'id': market['id']},
                {'$set': {
                    'name': market['name'],
                    'market_start_time': market.get('market_start_time'),
                    'total_matched': market.get('total_matched'),
                    'event_id': event_id,
                    'runners': market.get('runners', []),
                    'updated_at': datetime.utcnow()
                }},
                upsert=True
            )
        
        return jsonify({
            'status': 'success',
            'data': markets
        }), 200
    except Exception as e:
        logging.error(f"Error getting markets: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get markets'
        }), 500

@markets_bp.route('/market/<market_id>', methods=['GET'])
def get_market_book(market_id):
    """Get market book for a specific market"""
    try:
        betfair_api = get_betfair_api()
        market_book = betfair_api.get_market_book(market_id)
        
        if not market_book:
            return jsonify({
                'status': 'error',
                'message': 'Market not found'
            }), 404
        
        # Cache market book in database
        db = get_db()
        for book in market_book:
            db.market_books.update_one(
                {'market_id': book['market_id']},
                {'$set': {
                    'is_market_data_delayed': book.get('is_market_data_delayed'),
                    'status': book.get('status'),
                    'bet_delay': book.get('bet_delay'),
                    'total_matched': book.get('total_matched'),
                    'runners': book.get('runners', []),
                    'updated_at': datetime.utcnow()
                }},
                upsert=True
            )
        
        return jsonify({
            'status': 'success',
            'data': market_book[0] if market_book else None
        }), 200
    except Exception as e:
        logging.error(f"Error getting market book: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get market book'
        }), 500

@markets_bp.route('/popular', methods=['GET'])
def get_popular_markets():
    """Get popular markets"""
    try:
        # Get popular markets from database
        db = get_db()
        popular_markets = list(db.markets.find(
            {'is_popular': True},
            {'_id': 0}
        ).limit(10))
        
        # If no popular markets in database, get from Betfair API
        if not popular_markets:
            betfair_api = get_betfair_api()
            # Get football (soccer) markets as popular
            football_id = '1'  # Soccer/Football event type ID in Betfair
            events = betfair_api.get_events(football_id)
            
            if events:
                # Get markets for first 3 events
                all_markets = []
                for event in events[:3]:
                    markets = betfair_api.get_markets(event['id'])
                    all_markets.extend(markets)
                
                # Mark these markets as popular in database
                for market in all_markets:
                    db.markets.update_one(
                        {'id': market['id']},
                        {'$set': {
                            'name': market['name'],
                            'market_start_time': market.get('market_start_time'),
                            'total_matched': market.get('total_matched'),
                            'event_id': event['id'],
                            'runners': market.get('runners', []),
                            'is_popular': True,
                            'updated_at': datetime.utcnow()
                        }},
                        upsert=True
                    )
                
                popular_markets = all_markets[:10]
        
        return jsonify({
            'status': 'success',
            'data': popular_markets
        }), 200
    except Exception as e:
        logging.error(f"Error getting popular markets: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get popular markets'
        }), 500

# Endpoint to get active market IDs for testing
@markets_bp.route('/active-markets', methods=['GET'])
def get_active_markets():
    """Get a list of currently active market IDs for testing"""
    try:
        betfair_api = get_betfair_api()
        
        # Get soccer (football) events as they're usually active
        football_id = '1'  # Soccer/Football event type ID
        events = betfair_api.get_events(football_id)
        
        if not events or len(events) == 0:
            return jsonify({
                'status': 'error',
                'message': 'No active events found'
            }), 404
            
        # Get markets for the first few events
        all_markets = []
        for event in events[:3]:  # Limit to first 3 events to avoid too many API calls
            event_id = event['id']
            markets = betfair_api.get_markets(event_id)
            if markets:
                all_markets.extend(markets)
                
        if not all_markets or len(all_markets) == 0:
            return jsonify({
                'status': 'error',
                'message': 'No active markets found'
            }), 404
                
        # Return a list of market IDs and names
        market_ids = [{
            'id': market['id'],
            'name': market['name'],
            'event_name': next((event['name'] for event in events if event['id'] == market.get('event_id')), 'Unknown')
        } for market in all_markets[:20]]  # Limit to 20 markets
        
        return jsonify({
            'status': 'success',
            'message': f'Found {len(market_ids)} active markets',
            'data': market_ids
        }), 200
    except Exception as e:
        import traceback
        logging.error(f"Error getting active markets: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Failed to get active markets: {str(e)}'
        }), 500

# Endpoint to check Betfair API credentials
@markets_bp.route('/check-credentials', methods=['GET'])
def check_credentials():
    """Check if the Betfair API credentials are valid"""
    try:
        import os
        from datetime import datetime
        
        # Get credentials from environment
        app_key = os.getenv('BETFAIR_APP_KEY')
        session_token = os.getenv('BETFAIR_SESSION_TOKEN')
        
        # Check if credentials exist
        if not app_key or not session_token:
            return jsonify({
                'status': 'error',
                'message': 'Betfair credentials not found in environment variables',
                'app_key_exists': app_key is not None,
                'session_token_exists': session_token is not None
            }), 400
        
        # Initialize API client directly to test credentials
        import betfairlightweight
        client = betfairlightweight.APIClient(
            username="",
            password="",
            app_key=app_key,
            cert_files=None,
            lightweight=True
        )
        client.session_token = session_token
        
        # Try to make a simple API call to check if credentials are valid
        try:
            logging.info("Testing Betfair credentials with a simple API call")
            keep_alive = client.keep_alive()
            return jsonify({
                'status': 'success',
                'message': 'Betfair credentials are valid',
                'app_key': app_key[:5] + '...' if app_key else None,
                'session_token': session_token[:10] + '...' if session_token else None,
                'keep_alive_response': str(keep_alive)
            }), 200
        except Exception as api_error:
            logging.error(f"Betfair API error: {str(api_error)}")
            return jsonify({
                'status': 'error',
                'message': 'Betfair credentials are invalid or expired',
                'error': str(api_error),
                'instructions': 'Please update your BETFAIR_SESSION_TOKEN in the .env file'
            }), 401
    except Exception as e:
        import traceback
        logging.error(f"Error checking credentials: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Failed to check credentials: {str(e)}'
        }), 500

# Test endpoint to verify Betfair API functionality
@markets_bp.route('/test-api', methods=['GET'])
def test_betfair_api():
    """Test endpoint to verify Betfair API client functionality"""
    logging.info("Test API endpoint called")
    response_data = {}
    
    try:
        logging.info("Getting Betfair API client")
        betfair_api = get_betfair_api()
        response_data['got_api_client'] = betfair_api is not None
        
        # Check if client is initialized
        if not betfair_api:
            logging.error("Betfair API client is None")
            return jsonify({
                'status': 'error',
                'message': 'Betfair API client not initialized',
                'details': response_data
            }), 500
            
        response_data['app_key_exists'] = betfair_api.app_key is not None
        response_data['session_token_exists'] = betfair_api.session_token is not None
        
        if betfair_api.app_key:
            response_data['app_key_prefix'] = betfair_api.app_key[:5] + '...'
        
        if betfair_api.session_token:
            response_data['session_token_prefix'] = betfair_api.session_token[:10] + '...'
        
        logging.info("Checking if client is initialized")
        if not betfair_api.client:
            logging.error("Betfair API client.client is None")
            response_data['client_initialized'] = False
            return jsonify({
                'status': 'error',
                'message': 'Betfair API client not fully initialized',
                'details': response_data
            }), 500
            
        response_data['client_initialized'] = True
        
        # Test API by getting event types (sports)
        logging.info("Testing get_event_types() method")
        try:
            event_types = betfair_api.get_event_types()
            response_data['event_types_count'] = len(event_types)
            response_data['sample_event_types'] = event_types[:3] if event_types else []
        except Exception as api_error:
            logging.error(f"Error calling get_event_types(): {str(api_error)}")
            response_data['event_types_error'] = str(api_error)
        
        # Test market book API
        logging.info("Testing get_market_book() method with a test market ID")
        try:
            # Use a test market ID
            test_market_id = "1.179082386"  # This is just an example ID
            market_book = betfair_api.get_market_book(test_market_id)
            response_data['market_book_test'] = {
                'success': market_book is not None and len(market_book) > 0,
                'result_length': len(market_book) if market_book else 0
            }
        except Exception as market_error:
            logging.error(f"Error calling get_market_book(): {str(market_error)}")
            response_data['market_book_error'] = str(market_error)
        
        return jsonify({
            'status': 'success',
            'message': 'Betfair API test completed',
            'details': response_data
        }), 200
    except Exception as e:
        import traceback
        logging.error(f"Error testing Betfair API: {str(e)}")
        logging.error(traceback.format_exc())
        response_data['exception'] = str(e)
        return jsonify({
            'status': 'error',
            'message': f'Failed to test Betfair API: {str(e)}',
            'details': response_data
        }), 500

# New endpoints matching the original API structure

@markets_bp.route('/Data', methods=['GET'])
@markets_bp.route('/Data/', methods=['GET'])
def get_market_data():
    """Get market data by market ID and transform it to the required format"""
    try:
        market_id = request.args.get('id')
        token = request.args.get('token')  # Optional token
        debug = request.args.get('debug', 'false').lower() == 'true'
        
        if not market_id:
            return jsonify({
                'status': 'error',
                'message': 'Market ID is required'
            }), 400

        # Create the response format structure
        formatted_response = {
            "requestId": str(uuid.uuid4()),
            "marketBooks": [],
            "news": "",
            "scores": {"currentSet": 0}
        }
        
        # For testing purposes, allow using mock data
        if request.args.get('use_mock', 'false').lower() == 'true':
            from api.mock_data import get_mock_market_data
            current_app.logger.info(f"Using mock data for market ID: {market_id}")
            return get_mock_market_data()
            
        # Get Betfair API client
        betfair_api = get_betfair_api()
        if not betfair_api or not betfair_api.client:
            current_app.logger.error("Betfair API client not initialized or unavailable")
            return jsonify({
                'status': 'error',
                'message': 'Betfair API client not initialized'
            }), 500

        # Check if we should bypass cache for testing
        bypass_cache = debug or request.args.get('bypass_cache', 'false').lower() == 'true'
        
        # Try to get from cache first if not bypassing
        if not bypass_cache:
            db = get_db()
            cached_data = db.market_data.find_one({'market_id': market_id})
            if cached_data and 'data' in cached_data:
                # Check if cached data is in the new format and not too old (within 5 seconds)
                if ('requestId' in cached_data['data'] and 'marketBooks' in cached_data['data'] and
                    'updated_at' in cached_data and
                    (datetime.utcnow() - cached_data['updated_at']).total_seconds() < 5):
                    current_app.logger.debug(f"Using cached data for market ID: {market_id}")
                    return jsonify(cached_data['data']), 200
                else:
                    current_app.logger.debug(f"Cached data for market ID {market_id} is too old or invalid format")

        # Get market data from Betfair API
        current_app.logger.info(f"Fetching real-time data from Betfair for market ID: {market_id}")
        
        try:
            # Use the betfair_api wrapper to get market book
            market_books = betfair_api.get_market_book([market_id])
            
            # Always log the response structure for debugging
            current_app.logger.info(f"Market books type: {type(market_books)}")
            current_app.logger.info(f"Market books length: {len(market_books) if isinstance(market_books, list) else 'not a list'}")
            
            if market_books and isinstance(market_books, list) and len(market_books) > 0:
                sample_book = market_books[0]
                current_app.logger.info(f"Sample book type: {type(sample_book)}")
                current_app.logger.info(f"Sample book keys: {sample_book.keys() if isinstance(sample_book, dict) else 'not a dict'}")
                
                if isinstance(sample_book, dict) and 'runners' in sample_book:
                    current_app.logger.info(f"Runners type: {type(sample_book['runners'])}")
                    current_app.logger.info(f"Runners length: {len(sample_book['runners'])}")
                    if sample_book['runners']:
                        current_app.logger.info(f"Sample runner: {sample_book['runners'][0]}")
            
            if debug:
                current_app.logger.info(f"Raw Betfair response: {market_books}")
                
        except Exception as e:
            current_app.logger.error(f"Betfair API error: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'Failed to get market data from Betfair: {str(e)}'
            }), 500

        if not market_books or len(market_books) == 0:
            return jsonify({
                'status': 'error',
                'message': 'No market data found for the given ID'
            }), 404

        # Process each market book
        for market_book in market_books:
            # Log the market book structure for debugging
            current_app.logger.debug(f"Processing market book: {market_book}")
            
            # Extract total matched value, handling both dictionary and object formats
            total_matched = 0.0
            if isinstance(market_book, dict):
                total_matched = market_book.get('total_matched', market_book.get('totalMatched', 0.0))
            else:  # It's an object
                total_matched = getattr(market_book, 'total_matched', getattr(market_book, 'totalMatched', 0.0))
                
            market_book_data = {
                "id": market_id,
                "winners": 1,  # Default value
                "betDelay": _safe_get_attr(market_book, 'bet_delay', 0),
                "totalMatched": total_matched,
                "marketStatus": _safe_get_attr(market_book, 'status', "OPEN"),
                "maxBetSize": 0,  # Default value
                "bettingAllowed": True,  # Default value
                "isMarketDataDelayed": _safe_get_attr(market_book, 'is_market_data_delayed', False),
                "runners": [],
                "isRoot": False,  # Default value
                "timestamp": _safe_get_attr(market_book, 'publish_time', "0001-01-01T00:00:00"),
                "winnerIDs": []  # Default value
            }
            
            # Process runners - handle both dictionary and object formats
            runners = []
            if isinstance(market_book, dict):
                runners = market_book.get('runners', [])
            elif hasattr(market_book, 'runners'):
                runners = market_book.runners
            
            current_app.logger.info(f"Found {len(runners)} runners in market book")
            
            for runner in runners:
                # Create runner data structure
                # Get selection ID from the appropriate field
                selection_id = 0
                if isinstance(runner, dict):
                    selection_id = runner.get('selection_id', runner.get('selectionId', 0))
                else:  # It's an object
                    selection_id = getattr(runner, 'selection_id', getattr(runner, 'selectionId', 0))
                
                # Create runner data with ordered fields as requested using OrderedDict to preserve order
                runner_data = OrderedDict([
                    ("id", str(selection_id)),
                    # Price and size fields first
                    ("price1", 0),
                    ("price2", 0),
                    ("price3", 0),
                    ("size1", 0),
                    ("size2", 0),
                    ("size3", 0),
                    # Lay and ls fields next
                    ("lay1", 0),
                    ("lay2", 0),
                    ("lay3", 0),
                    ("ls1", 0),
                    ("ls2", 0),
                    ("ls3", 0),
                    # Status and handicap last
                    ("status", _safe_get_attr(runner, 'status', "ACTIVE")),
                    ("handicap", _safe_get_attr(runner, 'handicap', 0))
                ])
                
                # Process exchange data - handle both dictionary and object formats
                ex = None
                if isinstance(runner, dict) and 'ex' in runner:
                    ex = runner['ex']
                elif hasattr(runner, 'ex'):
                    ex = runner.ex
                
                if ex:
                    # Extract available_to_back (for price1, price2, price3, size1, size2, size3)
                    back_prices = []
                    
                    # Handle both dictionary and object formats for available_to_back
                    available_to_back = []
                    if isinstance(ex, dict) and 'available_to_back' in ex:
                        available_to_back = ex['available_to_back']
                    elif hasattr(ex, 'available_to_back'):
                        available_to_back = ex.available_to_back
                    
                    for price_size in available_to_back:
                        if isinstance(price_size, dict):
                            price = price_size.get('price', 0)
                            size = price_size.get('size', 0)
                        else:  # It's an object
                            price = getattr(price_size, 'price', 0)
                            size = getattr(price_size, 'size', 0)
                        
                        back_prices.append({
                            'price': price,
                            'size': size
                        })
                    
                    # Sort back prices by price (descending)
                    back_prices = sorted(back_prices, key=lambda x: x['price'], reverse=True)
                    
                    # Assign back prices and sizes
                    for i, price_data in enumerate(back_prices[:3]):
                        price_key = f"price{i+1}"
                        size_key = f"size{i+1}"
                        runner_data[price_key] = price_data['price']
                        runner_data[size_key] = price_data['size']
                    
                    # Extract available_to_lay (for lay1, lay2, lay3, ls1, ls2, ls3)
                    lay_prices = []
                    
                    # Handle both dictionary and object formats for available_to_lay
                    available_to_lay = []
                    if isinstance(ex, dict) and 'available_to_lay' in ex:
                        available_to_lay = ex['available_to_lay']
                    elif hasattr(ex, 'available_to_lay'):
                        available_to_lay = ex.available_to_lay
                    
                    for price_size in available_to_lay:
                        if isinstance(price_size, dict):
                            price = price_size.get('price', 0)
                            size = price_size.get('size', 0)
                        else:  # It's an object
                            price = getattr(price_size, 'price', 0)
                            size = getattr(price_size, 'size', 0)
                        
                        lay_prices.append({
                            'price': price,
                            'size': size
                        })
                    
                    # Sort lay prices by price (ascending)
                    lay_prices = sorted(lay_prices, key=lambda x: x['price'])
                    
                    # Assign lay prices and sizes
                    for i, price_data in enumerate(lay_prices[:3]):
                        lay_key = f"lay{i+1}"
                        ls_key = f"ls{i+1}"
                        runner_data[lay_key] = price_data['price']
                        runner_data[ls_key] = price_data['size']
                
                market_book_data["runners"].append(runner_data)
            
            formatted_response["marketBooks"].append(market_book_data)
        
        # Cache the formatted response
        if not bypass_cache:
            try:
                db = get_db()
                db.market_data.update_one(
                    {'market_id': market_id},
                    {'$set': {'market_id': market_id, 'data': formatted_response, 'updated_at': datetime.utcnow()}},
                    upsert=True
                )
            except Exception as e:
                current_app.logger.error(f"Error caching market data: {str(e)}")
                # Continue even if caching fails
        
        return jsonify(formatted_response), 200
    except Exception as e:
        current_app.logger.error(f"Error in get_market_data: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to get market data: {str(e)}'
        }), 500

@markets_bp.route('/market-data', methods=['GET'])
def get_market_data_v2():
    """Get market data by market ID (similar to http://localhost:5000/api/Markets/Data?id=1.244792514)"""
    try:
        market_id = request.args.get('id')
        token = request.args.get('token')  # Optional token parameter
        
        logging.info(f"Received request for market data with ID: {market_id}")
        
        if not market_id:
            logging.warning("No market ID provided in request")
            return jsonify({
                'status': 'error',
                'message': 'Market ID is required'
            }), 400
            
        # Create the response format structure
        formatted_response = {
            "requestId": str(uuid.uuid4()),
            "marketBooks": [],
            "news": "",
            "scores": {"currentSet": 0}
        }
        
        # Check if we should bypass cache for testing
        bypass_cache = request.args.get('bypass_cache', 'false').lower() == 'true'
        
        # Try to get from cache first if not bypassing
        if not bypass_cache:
            db = get_db()
            cached_data = db.market_data.find_one({'market_id': market_id})
            if cached_data and 'data' in cached_data:
                # Check if data is fresh (less than 5 seconds old)
                if 'updated_at' in cached_data:
                    age = datetime.utcnow() - cached_data['updated_at']
                    if age.total_seconds() < 5:  # 5 second cache
                        logging.info(f"Returning cached data for market {market_id}, age: {age.total_seconds()} seconds")
                        return jsonify(cached_data['data']), 200
        
        # Get market data from Betfair API
        betfair_api = get_betfair_api()
        
        # Get market book
        market_book = betfair_api.get_market_book([market_id])
        if not market_book or len(market_book) == 0:
            logging.warning(f"No market book found for ID: {market_id}")
            return jsonify({
                'status': 'error',
                'message': 'Market book not found'
            }), 404
            
        # Process each market book
        for book in market_book:
            # Format market book data
            market_book_data = {
                "id": market_id,
                "winners": safe_get(book, 'number_of_winners', 1),
                "betDelay": safe_get(book, 'bet_delay', 0),
                "totalMatched": safe_get(book, 'total_matched', 0.0),
                "marketStatus": safe_get(book, 'status', "OPEN"),
                "maxBetSize": 0,  # Default value
                "bettingAllowed": True,  # Default value
                "isMarketDataDelayed": safe_get(book, 'is_market_data_delayed', False),
                "runners": [],
                "isRoot": False,  # Default value
                "timestamp": safe_get(book, 'publish_time', "0001-01-01T00:00:00"),
                "winnerIDs": []  # Default value
            }
            
            # Process runners if they exist
            if 'runners' in book:
                for runner in book['runners']:
                    runner_data = {
                        "id": str(safe_get(runner, 'selection_id', 0)),
                        "status": safe_get(runner, 'status', "ACTIVE"),
                        "handicap": safe_get(runner, 'handicap', 0),
                        # Initialize price and size fields with default values
                        "price1": 0, "price2": 0, "price3": 0,
                        "size1": 0, "size2": 0, "size3": 0,
                        "lay1": 0, "lay2": 0, "lay3": 0,
                        "ls1": 0, "ls2": 0, "ls3": 0
                    }
                    
                    # Process exchange data if it exists
                    if 'ex' in runner:
                        # Extract available_to_back (for price1, price2, price3, size1, size2, size3)
                        back_prices = []
                        if 'available_to_back' in runner['ex']:
                            for price_size in runner['ex']['available_to_back']:
                                if 'price' in price_size and 'size' in price_size:
                                    back_prices.append({
                                        'price': price_size['price'],
                                        'size': price_size['size']
                                    })
                        
                        # Sort back prices by price (descending)
                        back_prices = sorted(back_prices, key=lambda x: x['price'], reverse=True)
                        
                        # Assign back prices and sizes
                        for i, price_data in enumerate(back_prices[:3]):
                            price_key = f"price{i+1}"
                            size_key = f"size{i+1}"
                            runner_data[price_key] = price_data['price']
                            runner_data[size_key] = price_data['size']
                        
                        # Extract available_to_lay (for lay1, lay2, lay3, ls1, ls2, ls3)
                        lay_prices = []
                        if 'available_to_lay' in runner['ex']:
                            for price_size in runner['ex']['available_to_lay']:
                                if 'price' in price_size and 'size' in price_size:
                                    lay_prices.append({
                                        'price': price_size['price'],
                                        'size': price_size['size']
                                    })
                        
                        # Sort lay prices by price (ascending)
                        lay_prices = sorted(lay_prices, key=lambda x: x['price'])
                        
                        # Assign lay prices and sizes
                        for i, price_data in enumerate(lay_prices[:3]):
                            lay_key = f"lay{i+1}"
                            ls_key = f"ls{i+1}"
                            runner_data[lay_key] = price_data['price']
                            runner_data[ls_key] = price_data['size']
                    
                    market_book_data["runners"].append(runner_data)
            
            formatted_response["marketBooks"].append(market_book_data)
        
        # Cache the formatted response
        if not bypass_cache:
            try:
                db = get_db()
                db.market_data.update_one(
                    {'market_id': market_id},
                    {'$set': {'market_id': market_id, 'data': formatted_response, 'updated_at': datetime.utcnow()}},
                    upsert=True
                )
            except Exception as e:
                current_app.logger.error(f"Error caching market data: {str(e)}")
                # Continue even if caching fails
        
        return jsonify(formatted_response), 200
    except Exception as e:
        current_app.logger.error(f"Error in get_market_data: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to get market data: {str(e)}'
        }), 500
        
        logging.info(f"Received request for market data with ID: {market_id}")
        
        if not market_id:
            logging.warning("No market ID provided in request")
            return jsonify({
                'status': 'error',
                'message': 'Market ID is required'
            }), 400
        
        # Temporarily bypass cache for testing
        logging.info(f"Bypassing cache for testing purposes")
        db = get_db()
        
        # Clear any existing cached data for this market ID
        try:
            db.market_data.delete_many({'market_id': market_id})
            logging.info(f"Cleared cache for market ID: {market_id}")
        except Exception as e:
            logging.warning(f"Failed to clear cache: {str(e)}")
        
        # Always fetch fresh data from Betfair API
        # We'll restore the caching logic after testing
            
        # If not in cache, fetch from Betfair API
        logging.info(f"No cached data found, fetching from Betfair API")
        
        # Direct approach using betfairlightweight
        import os
        import betfairlightweight
        from betfairlightweight import filters
        import uuid
        
        app_key = os.getenv('BETFAIR_APP_KEY')
        session_token = os.getenv('BETFAIR_SESSION_TOKEN')
        
        if not app_key or not session_token:
            logging.error("Missing Betfair credentials in environment variables")
            return jsonify({
                'status': 'error',
                'message': 'Missing Betfair credentials'
            }), 500
        
        # Initialize client directly
        client = betfairlightweight.APIClient(
            username="",
            password="",
            app_key=app_key,
            cert_files=None,
            lightweight=True
        )
        client.session_token = session_token
        
        logging.info(f"Initialized Betfair client with app_key={app_key[:5]}... and session_token={session_token[:10]}...")
        
        # Check if the market ID format is valid
        import re
        if not re.match(r'^\d+\.\d+$', market_id):
            logging.warning(f"Invalid market ID format: {market_id}")
            return jsonify({
                'status': 'error',
                'message': 'Invalid market ID format'
            }), 400
        
        try:
            # Create price filter
            price_filter = filters.price_projection(
                price_data=["EX_BEST_OFFERS", "EX_TRADED"],
                ex_best_offers_overrides=filters.ex_best_offers_overrides(best_prices_depth=3)
            )
            
            # Make direct API call
            logging.info(f"Making direct API call to list_market_book for ID: {market_id}")
            market_books = client.betting.list_market_book(
                market_ids=[market_id],
                price_projection=price_filter
            )
            logging.info(f"Received {len(market_books)} market books from API")
            
            if not market_books or len(market_books) == 0:
                logging.warning(f"Market not found for ID: {market_id}")
                return jsonify({
                    'status': 'error',
                    'message': 'Market not found'
                }), 404
            
            # Process the response
            market_book = market_books[0]
            logging.info(f"Market book response type: {type(market_book)}, dir: {dir(market_book)}")
            
            # Create the new response format
            formatted_response = {
                "requestId": str(uuid.uuid4()),
                "marketBooks": [],
                "news": "",
                "scores": {"currentSet": 0}
            }
            
            # Format market book data
            market_book_data = {
                "id": market_id,
                "winners": _safe_get_attr(market_book, 'number_of_winners', 1),
                "betDelay": _safe_get_attr(market_book, 'bet_delay', 0),
                "totalMatched": _safe_get_attr(market_book, 'total_matched', 0.0),
                "marketStatus": _safe_get_attr(market_book, 'status', "OPEN"),
                "maxBetSize": 0.0,  # Default value
                "bettingAllowed": True,  # Default value
                "isMarketDataDelayed": _safe_get_attr(market_book, 'is_market_data_delayed', False),
                "runners": [],
                "isRoot": False,  # Default value
                "timestamp": "0001-01-01T00:00:00",  # Default value
                "winnerIDs": []
            }
            
            # Process runners if they exist
            logging.info(f"Processing runners: {market_book.runners if hasattr(market_book, 'runners') else 'No runners'}")
            
            if hasattr(market_book, 'runners') and market_book.runners:
                for runner in market_book.runners:
                    logging.info(f"Processing runner: {runner}")
                    
                    # Debug runner attributes
                    if hasattr(runner, '__dict__'):
                        logging.info(f"Runner attributes: {dir(runner)}")
                    
                    runner_data = {
                        "id": str(_safe_get_attr(runner, 'selection_id', 0)),
                        "status": _safe_get_attr(runner, 'status', "ACTIVE"),
                        "handicap": _safe_get_attr(runner, 'handicap', 0.0),
                    }
                    
                    logging.info(f"Runner data so far: {runner_data}")
                    
                    # Process exchange data if it exists
                    if hasattr(runner, 'ex') and runner.ex:
                        logging.info(f"Processing exchange data: {runner.ex}")
                        
                        # Debug exchange attributes
                        if hasattr(runner.ex, '__dict__'):
                            logging.info(f"Exchange attributes: {dir(runner.ex)}")
                        
                        # Back prices (price1, price2, price3)
                        back_prices = []
                        if hasattr(runner.ex, 'available_to_back') and runner.ex.available_to_back:
                            logging.info(f"Available to back: {runner.ex.available_to_back}")
                            back_prices = [
                                {'price': p.price if hasattr(p, 'price') else p['price'], 
                                 'size': p.size if hasattr(p, 'size') else p['size']} 
                                for p in runner.ex.available_to_back
                            ]
                            back_prices = sorted(back_prices, key=lambda x: x['price'], reverse=True)
                            logging.info(f"Sorted back prices: {back_prices}")
                        
                        # Fill in price1, price2, price3 and size1, size2, size3
                        for i in range(1, 4):
                            if i <= len(back_prices):
                                runner_data[f"price{i}"] = back_prices[i-1]['price']
                                runner_data[f"size{i}"] = back_prices[i-1]['size']
                            else:
                                # Default values if not enough prices
                                runner_data[f"price{i}"] = 0.0
                                runner_data[f"size{i}"] = 0.0
                        
                        # Lay prices (lay1, lay2, lay3)
                        lay_prices = []
                        if hasattr(runner.ex, 'available_to_lay') and runner.ex.available_to_lay:
                            logging.info(f"Available to lay: {runner.ex.available_to_lay}")
                            lay_prices = [
                                {'price': p.price if hasattr(p, 'price') else p['price'], 
                                 'size': p.size if hasattr(p, 'size') else p['size']} 
                                for p in runner.ex.available_to_lay
                            ]
                            lay_prices = sorted(lay_prices, key=lambda x: x['price'])
                            logging.info(f"Sorted lay prices: {lay_prices}")
                        
                        # Fill in lay1, lay2, lay3 and ls1, ls2, ls3
                        for i in range(1, 4):
                            if i <= len(lay_prices):
                                runner_data[f"lay{i}"] = lay_prices[i-1]['price']
                                runner_data[f"ls{i}"] = lay_prices[i-1]['size']
                            else:
                                # Default values if not enough prices
                                runner_data[f"lay{i}"] = 0.0
                                runner_data[f"ls{i}"] = 0.0
                    else:
                        logging.warning(f"No exchange data found for runner {runner_data['id']}")
                        # Set default values for all price fields
                        for i in range(1, 4):
                            runner_data[f"price{i}"] = 0.0
                            runner_data[f"size{i}"] = 0.0
                            runner_data[f"lay{i}"] = 0.0
                            runner_data[f"ls{i}"] = 0.0
                    
                    logging.info(f"Final runner data: {runner_data}")
                    market_book_data["runners"].append(runner_data)
            
            formatted_response["marketBooks"].append(market_book_data)
            result = formatted_response
                
            logging.info(f"Formatted result: {result}")
            
            
        except Exception as api_error:
            logging.error(f"Betfair API error: {str(api_error)}")
            return jsonify({
                'status': 'error',
                'message': f'Betfair API error: {str(api_error)}'
            }), 500
        
        # Cache market data in database
        try:
            db.market_data.update_one(
                {'market_id': market_id},
                {'$set': {
                    'data': result,
                    'updated_at': datetime.utcnow()
                }},
                upsert=True
            )
            logging.info(f"Successfully cached market data for ID: {market_id}")
        except Exception as db_error:
            logging.error(f"Database error when caching market data: {str(db_error)}")
            # Continue even if caching fails
        
        return jsonify(result), 200
    except Exception as e:
        import traceback
        logging.error(f"Error getting market data: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': 'Failed to get market data'
        }), 500

@markets_bp.route('/catalog2', methods=['GET'])
@markets_bp.route('/catalog2/', methods=['GET'])
def get_market_catalog():
    """Get market catalog by market ID (similar to https://bpexch.net/api/markets/catalog2/?id=1.244792514)"""
    try:
        market_id = request.args.get('id')
        bypass_cache = request.args.get('bypass_cache', 'false').lower() == 'true'
        logging.info(f"Received request for market catalog with ID: {market_id}, bypass_cache: {bypass_cache}")
        
        if not market_id:
            logging.warning("No market ID provided in request")
            return jsonify({
                'status': 'error',
                'message': 'Market ID is required'
            }), 400
            
        # First try to get from cache unless bypass_cache is true
        db = get_db()
        cached_catalog = None if bypass_cache else db.market_catalogs.find_one({'market_id': market_id})
        
        # Check if cache is fresh (less than 5 seconds old)
        cache_fresh = False
        if cached_catalog and 'updated_at' in cached_catalog:
            cache_age = (datetime.utcnow() - cached_catalog['updated_at']).total_seconds()
            cache_fresh = cache_age < 5  # Consider cache fresh if less than 5 seconds old
            logging.info(f"Cache age for market catalog {market_id}: {cache_age} seconds")
        
        if cached_catalog and 'catalog' in cached_catalog and cache_fresh:
            logging.info(f"Found fresh cached market catalog for ID: {market_id}")
            return jsonify(cached_catalog['catalog']), 200
            
        # If not in cache or cache is stale, fetch from Betfair API
        logging.info(f"No fresh cached catalog found, fetching from Betfair API")
        
        # Direct approach using betfairlightweight
        import os
        import betfairlightweight
        from betfairlightweight import filters
        
        app_key = os.getenv('BETFAIR_APP_KEY')
        session_token = os.getenv('BETFAIR_SESSION_TOKEN')
        
        if not app_key or not session_token:
            logging.error("Missing Betfair credentials in environment variables")
            return jsonify({
                'status': 'error',
                'message': 'Missing Betfair credentials'
            }), 500
        
        # Initialize client directly
        client = betfairlightweight.APIClient(
            username="",
            password="",
            app_key=app_key,
            cert_files=None,
            lightweight=True
        )
        client.session_token = session_token
        
        logging.info(f"Initialized Betfair client with app_key={app_key[:5]}... and session_token={session_token[:10]}...")
        
        # Check if the market ID format is valid (should be like 1.244981722)
        import re
        if not re.match(r'^\d+\.\d+$', market_id):
            logging.warning(f"Invalid market ID format: {market_id}")
            return jsonify({
                'status': 'error',
                'message': 'Invalid market ID format'
            }), 400
        
        # Get market catalog information
        try:
            market_filter = filters.market_filter(market_ids=[market_id])
            market_projection = [
                'COMPETITION',
                'EVENT',
                'EVENT_TYPE',
                'MARKET_START_TIME',
                'MARKET_DESCRIPTION',
                'RUNNER_DESCRIPTION',
                'RUNNER_METADATA'
            ]
            
            logging.info(f"Making direct API call to list_market_catalogue for ID: {market_id}")
            market_catalogs = client.betting.list_market_catalogue(
                filter=market_filter,
                max_results=1,
                market_projection=market_projection
            )
            logging.info(f"Received response from Betfair API: {len(market_catalogs) if market_catalogs else 0} catalogs")
        except Exception as api_error:
            logging.error(f"Betfair API error: {str(api_error)}")
            return jsonify({
                'status': 'error',
                'message': f'Betfair API error: {str(api_error)}'
            }), 500
        
        if not market_catalogs or len(market_catalogs) == 0:
            logging.warning(f"Market catalog not found for ID: {market_id}")
            return jsonify({
                'status': 'error',
                'message': 'Market not found'
            }), 404
            
        market_catalog = market_catalogs[0]
        logging.info(f"Processing market catalog type: {type(market_catalog)}")
        
        # Use safe_get to access market ID regardless of response type
        market_id_value = safe_get(market_catalog, 'marketId') or safe_get(market_catalog, 'market_id')
        logging.info(f"Market ID value: {market_id_value}")
        
        # Format the response to match the expected format
        try:
            logging.info(f"Market catalog response type: {type(market_catalog)}, dir: {dir(market_catalog)}")
            
            # Create a result dictionary using safe_get for all fields, matching the target structure exactly
            result = OrderedDict([
                ('marketId', safe_get(market_catalog, 'marketId') or safe_get(market_catalog, 'market_id')),
                ('marketName', safe_get(market_catalog, 'marketName') or safe_get(market_catalog, 'market_name')),
                ('marketStartTime', safe_get(market_catalog, 'marketStartTime') or safe_get(market_catalog, 'market_start_time')),
                ('suspendTime', None),
                ('settleTime', None),
                ('bettingType', 'ODDS'),
                ('isTurnInPlayEnabled', True),
                ('marketType', safe_get(market_catalog, 'marketType') or safe_get(market_catalog, 'market_type', 'MATCH_ODDS')),
                ('priceLadderDetails', 'CLASSIC'),
                # Event type fields
                ('eventTypeId', None),
                ('eventId', None),
                ('eventName', None),
                ('competitionId', None),
                ('winners', 1),
                ('status', 'OPEN'),
                ('countryCode', None),
                # Detailed rules field with HTML formatting as in target
                ('rules', "\u003Cb\u003EMarket Information\u003C/b\u003E\u003Cbr\u003EFor further information please see \u003Ca href=http://content.betfair.com/aboutus/content.asp?sWhichKey=Rules%20and%20Regulations#undefined.do style=color:0163ad; text-decoration: underline; target=_blank\u003ERules & Regs\u003C/a\u003E.\u003Cbr\u003E\u003Cbr\u003E Who will win this Test match? At the start of scheduled play all unmatched bets will be cancelled and this market will be turned in-play. This market will not be actively managed therefore it is the responsibility of all users to manage their own positions. Competition Rules apply. \u003Cbr\u003E\u003Cbr\u003ECustomers should be aware that:\u003Cbr\u003E\u003Cbr\u003E\u003Cli\u003E\u003Cb/\u003ETransmissions described as \"live\" by some broadcasters may actually be delayed\u003C/li\u003E\u003Cbr\u003E\u003Cli\u003EThe extent of any such delay may vary, depending on the set-up through which they are receiving pictures or data.\u003C/b\u003E\u003C/li\u003E\u003Cbr\u003E\n\u003Cul\u003E\u003Cli\u003E\u003Cb\u003EIf the official result is a Tied Match in any Test, County or Limited Overs Match then all bets on Match Odds markets will be void\u003C/b\u003E\u003C/li\u003E\u003Cbr\u003E\u003Cli\u003EAt the conclusion of each days play this market will revert to a non in-play status with no time delay in effect then at the start of the following days play this market will be turned in-play again with unmatched bets \u003Cb\u003E\u003CFONT COLOR=\"red\"\u003Enot\u003C/FONT\u003E\u003C/b\u003E cancelled.\u003C/li\u003E"),
                ('maxBetSize', 2000000),
                ('origin', 'BETFAIR'),
                ('externalId', None),
                ('settleAttempts', 0),
                ('maxExposure', 20000000),
                ('betDelay', 1),
                ('news', ''),
                ('unmatchBet', True),
                ('sizeOverride', False),
                ('sortPriority', -1),
                ('cancelDelay', 0),
                ('maxOdds', 150),
                ('runners', [])
            ])
            
            # Process competition, event, and event type data
            competition = safe_get(market_catalog, 'competition')
            event = safe_get(market_catalog, 'event')
            event_type = safe_get(market_catalog, 'eventType') or safe_get(market_catalog, 'event_type')
            
            # Update fields directly in the result OrderedDict with proper type conversion
            if competition:
                comp_id = safe_get(competition, 'id')
                result['competitionId'] = str(comp_id) if comp_id else None
            
            if event:
                event_id = safe_get(event, 'id')
                result['eventId'] = int(event_id) if event_id else None
                result['eventName'] = safe_get(event, 'name')
                result['countryCode'] = safe_get(event, 'countryCode') or safe_get(event, 'country_code') or 'GB'
            
            if event_type:
                event_type_id = safe_get(event_type, 'id')
                result['eventTypeId'] = int(event_type_id) if event_type_id else None
                
            # Add sport information
            if event_type and safe_get(event_type, 'name'):
                sport_name = safe_get(event_type, 'name')
                sport_id = safe_get(event_type, 'id')
                
                result['eventType'] = sport_name
                result['sport'] = OrderedDict([
                    ('id', int(sport_id) if sport_id else 0),
                    ('name', sport_name),
                    ('active', True),
                    ('image', sport_name.lower() + '.svg'),
                    ('autoOpen', False),
                    ('allowSubMarkets', False),
                    ('amountRequired', 100000),
                    ('maxBet', 5000000),
                    ('autoOpenMinutes', 9999),
                    ('betDelay', 0),
                    ('unmatchBet', True)
                ])
                
            # Add additional fields to match target format
            market_start_time = safe_get(market_catalog, 'marketStartTime') or safe_get(market_catalog, 'market_start_time')
            result['marketStartTimeUtc'] = market_start_time + '.0000000Z' if market_start_time else None
            result['suspendTimeUtc'] = None
            result['settleTimeUtc'] = None
            result['raceName'] = None
            result['minutesToOpenMarket'] = 9999
            result['statusOverride'] = 0
            result['hasFancyOdds'] = False
            result['isFancy'] = False
            result['isLocalFancy'] = False
            result['isBmMarket'] = True
            result['hasSessionMarkets'] = False
            result['hasBookmakerMarkets'] = False
            result['updatedAt'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            result['casinoPl'] = None
            result['removedRunnersCount'] = 0
            result['state'] = 0
            
            # Try to get market book for price data
            try:
                price_projection = {
                    'priceData': ['EX_BEST_OFFERS'],
                    'virtualise': True
                }
                market_books = client.betting.list_market_book(
                    market_ids=[market_id],
                    price_projection=price_projection
                )
                market_book = market_books[0] if market_books else None
                logging.info(f"Fetched market book for prices: {market_book is not None}")
            except Exception as price_error:
                logging.error(f"Error fetching market book prices: {str(price_error)}")
                market_book = None
                
            # Create a dictionary of runner prices from market book
            runner_prices = {}
            if market_book:
                book_runners = safe_get(market_book, 'runners', [])
                for book_runner in book_runners:
                    selection_id = safe_get(book_runner, 'selectionId') or safe_get(book_runner, 'selection_id')
                    if selection_id:
                        # Extract back prices
                        back_prices = []
                        ex = safe_get(book_runner, 'ex', {})
                        available_to_back = safe_get(ex, 'availableToBack', [])
                        for i, price in enumerate(available_to_back[:3]):
                            back_prices.append({
                                'price': safe_get(price, 'price', 0.0),
                                'size': safe_get(price, 'size', 0.0)
                            })
                        # Fill remaining slots if needed
                        while len(back_prices) < 3:
                            back_prices.append({'price': 0.0, 'size': 0.0})
                            
                        # Extract lay prices
                        lay_prices = []
                        available_to_lay = safe_get(ex, 'availableToLay', [])
                        for i, price in enumerate(available_to_lay[:3]):
                            lay_prices.append({
                                'price': safe_get(price, 'price', 0.0),
                                'size': safe_get(price, 'size', 0.0)
                            })
                        # Fill remaining slots if needed
                        while len(lay_prices) < 3:
                            lay_prices.append({'price': 0.0, 'size': 0.0})
                            
                        # Store prices for this runner
                        runner_prices[str(selection_id)] = {
                            'available_to_back': back_prices,
                            'available_to_lay': lay_prices,
                            'traded_volume': safe_get(ex, 'tradedVolume', [])
                        }
            
            # Process runners with the exact format required
            runners = safe_get(market_catalog, 'runners')
            if runners:
                result['runners'] = []
                for runner in runners:
                    selection_id = safe_get(runner, 'selectionId') or safe_get(runner, 'selection_id')
                    selection_id_str = str(selection_id) if selection_id else '0'
                    
                    # Get prices for this runner or use default values
                    prices = runner_prices.get(selection_id_str, {
                        'available_to_back': [
                            {'price': 1.95, 'size': 100.0},
                            {'price': 1.94, 'size': 100.0},
                            {'price': 1.93, 'size': 100.0}
                        ],
                        'available_to_lay': [
                            {'price': 2.02, 'size': 100.0},
                            {'price': 2.04, 'size': 100.0},
                            {'price': 2.06, 'size': 100.0}
                        ],
                        'traded_volume': []
                    })
                    
                    # Create runner with all required fields in the exact order
                    runner_dict = OrderedDict([
                        ('marketId', result['marketId']),
                        ('selectionId', selection_id),
                        ('runnerName', safe_get(runner, 'runnerName') or safe_get(runner, 'runner_name')),
                        ('handicap', safe_get(runner, 'handicap', 0.0)),
                        ('sortPriority', safe_get(runner, 'sortPriority') or safe_get(runner, 'sort_priority', 0)),
                        ('status', 'ACTIVE'),
                        ('removalDate', None),
                        ('silkColor', ''),
                        ('score', None),
                        ('adjFactor', None),
                        ('metadata', '{\r\n  "runnerId": "' + str(selection_id) + '"\r\n}'),
                        ('jockeyName', ''),
                        ('trainerName', ''),
                        ('age', ''),
                        ('weight', ''),
                        ('lastRun', ''),
                        ('wearing', ''),
                        ('state', 0),
                        ('prices', prices)
                    ])
                    result['runners'].append(runner_dict)
                
            logging.info(f"Successfully formatted market catalog response: {result}")
            
            # If the result is missing key fields, try to get them from the raw response
            if not result.get('marketId') and hasattr(market_catalog, 'raw_response'):
                logging.info("Trying to extract data from raw_response")
                raw = market_catalog.raw_response
                if isinstance(raw, dict):
                    if 'marketId' in raw:
                        result['marketId'] = raw['marketId']
                    if 'marketName' in raw:
                        result['marketName'] = raw['marketName']
                    # Add other fields as needed
        except Exception as format_error:
            logging.error(f"Error formatting market catalog: {str(format_error)}")
            return jsonify({
                'status': 'error',
                'message': f'Error formatting market catalog: {str(format_error)}'
            }), 500
        
        # Cache catalog in database
        try:
            db.market_catalogs.update_one(
                {'market_id': market_id},
                {'$set': {
                    'catalog': result,
                    'updated_at': datetime.utcnow()
                }},
                upsert=True
            )
            logging.info(f"Successfully cached market catalog for ID: {market_id}")
        except Exception as db_error:
            logging.error(f"Database error when caching market catalog: {str(db_error)}")
            # Continue even if caching fails
        
        return jsonify(result), 200
    except Exception as e:
        import traceback
        logging.error(f"Error getting market catalog: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Failed to get market catalog: {str(e)}'
        }), 500

@markets_bp.route('/catalogs', methods=['GET'])
@markets_bp.route('/catalogs/', methods=['GET'])
def get_multiple_catalogs():
    """Get multiple market catalogs by IDs (similar to https://bpexch.net/api/markets/catalogs/?ids=9.20467777,9.20468932)"""
    try:
        # Check for both 'ids' and 'id' parameters for compatibility
        market_ids_param = request.args.get('ids') or request.args.get('id')
        bypass_cache = request.args.get('bypass_cache', 'false').lower() == 'true'
        
        if not market_ids_param:
            return jsonify({
                'status': 'error',
                'message': 'Market IDs are required (use either "id" or "ids" parameter)'
            }), 400
            
        # Clean and validate market IDs
        market_ids = [market_id.strip() for market_id in market_ids_param.split(',') if market_id.strip()]
        
        if not market_ids:
            return jsonify({
                'status': 'error',
                'message': 'No valid market IDs provided'
            }), 400
            
        logging.info(f"Processing request for market IDs: {market_ids}")
        
        # Try to get from cache first if not bypassing cache
        results = []
        missing_market_ids = []
        
        if not bypass_cache:
            db = get_db()
            for market_id in market_ids:
                cached_catalog = db.market_catalogs.find_one({'market_id': market_id})
                if cached_catalog:
                    # Check if cache is fresh (less than 5 seconds old)
                    updated_at = cached_catalog.get('updated_at')
                    if updated_at:
                        cache_age = (datetime.utcnow() - updated_at).total_seconds()
                        if cache_age < 5:  # 5 seconds freshness threshold
                            logging.info(f"Using cached catalog for market {market_id}, age: {cache_age:.2f}s")
                            results.append(cached_catalog['catalog'])
                            continue
                        else:
                            logging.info(f"Cache expired for market {market_id}, age: {cache_age:.2f}s")
                missing_market_ids.append(market_id)
        else:
            missing_market_ids = market_ids
            logging.info("Bypassing cache as requested")
        
        # If all markets were found in cache and fresh, return them
        if not missing_market_ids:
            logging.info("All markets found in cache and fresh")
            return jsonify(results), 200
            
        # Otherwise, fetch the missing markets from Betfair API
        logging.info(f"Fetching {len(missing_market_ids)} markets from Betfair API")
        betfair_api = get_betfair_api()
        
        try:
            # Process market IDs in batches to avoid TOO_MUCH_DATA error
            BATCH_SIZE = 5  # Smaller batch size to avoid API limits
            
            # Get market catalogs in batches
            market_catalogs = []
            for i in range(0, len(missing_market_ids), BATCH_SIZE):
                batch_ids = missing_market_ids[i:i+BATCH_SIZE]
                logging.info(f"Fetching catalog batch {i//BATCH_SIZE + 1} with {len(batch_ids)} market IDs")
                
                market_filter = filters.market_filter(market_ids=batch_ids)
                batch_catalogs = betfair_api.client.betting.list_market_catalogue(
                    filter=market_filter,
                    max_results=len(batch_ids),
                    market_projection=["COMPETITION", "EVENT", "EVENT_TYPE", "RUNNER_DESCRIPTION", "MARKET_START_TIME"]
                )
                market_catalogs.extend(batch_catalogs)
            
            logging.info(f"Retrieved {len(market_catalogs)} market catalogs from Betfair in total")
            
            # Get market books in batches
            market_books = []
            for i in range(0, len(missing_market_ids), BATCH_SIZE):
                batch_ids = missing_market_ids[i:i+BATCH_SIZE]
                logging.info(f"Fetching market book batch {i//BATCH_SIZE + 1} with {len(batch_ids)} market IDs")
                try:
                    batch_books = betfair_api.get_market_book(batch_ids)
                    market_books.extend(batch_books)
                except Exception as batch_error:
                    logging.error(f"Error fetching market book batch: {str(batch_error)}")
                    # Continue with other batches even if one fails
            
            logging.info(f"Retrieved {len(market_books)} market books from Betfair in total")
            
            # Create a dictionary of market books by market_id for easy lookup
            market_books_dict = {book['market_id']: book for book in market_books}
            
            # Combine catalog and book data
            new_results = []
            for catalog in market_catalogs:
                # Check if catalog is a dictionary or an object
                if isinstance(catalog, dict):
                    market_id = catalog.get('marketId') or catalog.get('market_id')
                    market_name = catalog.get('marketName') or catalog.get('market_name')
                    market_start_time = catalog.get('marketStartTime') or catalog.get('market_start_time')
                    competition = catalog.get('competition')
                    event = catalog.get('event')
                    event_type = catalog.get('eventType') or catalog.get('event_type')
                    runners = catalog.get('runners', [])
                else:  # It's an object
                    market_id = catalog.market_id
                    market_name = catalog.market_name
                    market_start_time = catalog.market_start_time
                    competition = catalog.competition if hasattr(catalog, 'competition') else None
                    event = catalog.event if hasattr(catalog, 'event') else None
                    event_type = catalog.event_type if hasattr(catalog, 'event_type') else None
                    runners = catalog.runners if hasattr(catalog, 'runners') else []
                
                book = market_books_dict.get(market_id, {})
                
                # Create result object with the exact same format as get_market_catalog
                result = OrderedDict([
                    ('marketId', market_id),
                    ('marketName', market_name),
                    ('marketStartTime', market_start_time),
                    ('suspendTime', None),
                    ('settleTime', None),
                    ('bettingType', 'ODDS'),
                    ('isTurnInPlayEnabled', True),
                    ('marketType', 'MATCH_ODDS'),
                    ('priceLadderDetails', 'CLASSIC'),
                    # Event type fields
                    ('eventTypeId', int(_safe_get_attr(event_type, 'id')) if _safe_get_attr(event_type, 'id') else None),
                    ('eventId', int(_safe_get_attr(event, 'id')) if _safe_get_attr(event, 'id') else None),
                    ('eventName', _safe_get_attr(event, 'name')),
                    ('competitionId', str(_safe_get_attr(competition, 'id')) if _safe_get_attr(competition, 'id') else None),
                    ('winners', 1),
                    ('status', 'OPEN'),
                    ('countryCode', _safe_get_attr(event, 'country_code') or 'GB'),
                    # Detailed rules field with HTML formatting as in target
                    ('rules', "\u003Cb\u003EMarket Information\u003C/b\u003E\u003Cbr\u003EFor further information please see \u003Ca href=http://content.betfair.com/aboutus/content.asp?sWhichKey=Rules%20and%20Regulations#undefined.do style=color:0163ad; text-decoration: underline; target=_blank\u003ERules & Regs\u003C/a\u003E.\u003Cbr\u003E\u003Cbr\u003E Who will win this Test match? At the start of scheduled play all unmatched bets will be cancelled and this market will be turned in-play. This market will not be actively managed therefore it is the responsibility of all users to manage their own positions. Competition Rules apply. \u003Cbr\u003E\u003Cbr\u003ECustomers should be aware that:\u003Cbr\u003E\u003Cbr\u003E\u003Cli\u003E\u003Cb/\u003ETransmissions described as \"live\" by some broadcasters may actually be delayed\u003C/li\u003E\u003Cbr\u003E\u003Cli\u003EThe extent of any such delay may vary, depending on the set-up through which they are receiving pictures or data.\u003C/b\u003E\u003C/li\u003E\u003Cbr\u003E\n\u003Cul\u003E\u003Cli\u003E\u003Cb\u003EIf the official result is a Tied Match in any Test, County or Limited Overs Match then all bets on Match Odds markets will be void\u003C/b\u003E\u003C/li\u003E\u003Cbr\u003E\u003Cli\u003EAt the conclusion of each days play this market will revert to a non in-play status with no time delay in effect then at the start of the following days play this market will be turned in-play again with unmatched bets \u003Cb\u003E\u003CFONT COLOR=\"red\"\u003Enot\u003C/FONT\u003E\u003C/b\u003E cancelled.\u003C/li\u003E"),
                    ('maxBetSize', 2000000),
                    ('origin', 'BETFAIR'),
                    ('externalId', None),
                    ('settleAttempts', 0),
                    ('maxExposure', 20000000),
                    ('betDelay', 1),
                    ('news', ''),
                    ('unmatchBet', True),
                    ('sizeOverride', False),
                    ('sortPriority', -1),
                    ('cancelDelay', 0),
                    ('maxOdds', 150),
                    ('runners', [])
                ])
                
                # Add sport information
                if event_type and _safe_get_attr(event_type, 'name'):
                    sport_name = _safe_get_attr(event_type, 'name')
                    sport_id = _safe_get_attr(event_type, 'id')
                    
                    result['eventType'] = sport_name
                    result['sport'] = OrderedDict([
                        ('id', int(sport_id) if sport_id else 0),
                        ('name', sport_name),
                        ('active', True),
                        ('image', sport_name.lower() + '.svg'),
                        ('autoOpen', False),
                        ('allowSubMarkets', False),
                        ('amountRequired', 100000),
                        ('maxBet', 5000000),
                        ('autoOpenMinutes', 9999),
                        ('betDelay', 0),
                        ('unmatchBet', True)
                    ])
                
                # Add additional fields to match target format
                result['marketStartTimeUtc'] = market_start_time + '.0000000Z' if market_start_time else None
                result['suspendTimeUtc'] = None
                result['settleTimeUtc'] = None
                result['raceName'] = None
                result['minutesToOpenMarket'] = 9999
                result['statusOverride'] = 0
                result['hasFancyOdds'] = False
                result['isFancy'] = False
                result['isLocalFancy'] = False
                result['isBmMarket'] = True
                result['hasSessionMarkets'] = False
                result['hasBookmakerMarkets'] = False
                result['updatedAt'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
                result['casinoPl'] = None
                result['removedRunnersCount'] = 0
                result['state'] = 0
                
                # Process runners safely with the exact same format as get_market_catalog
                if runners:
                    for runner in runners:
                        if isinstance(runner, dict):
                            selection_id = runner.get('selectionId') or runner.get('selection_id')
                            runner_name = runner.get('runnerName') or runner.get('runner_name')
                            handicap = runner.get('handicap', 0.0)
                            sort_priority = runner.get('sortPriority') or runner.get('sort_priority', 0)
                        else:  # It's an object
                            selection_id = runner.selection_id
                            runner_name = runner.runner_name
                            handicap = getattr(runner, 'handicap', 0.0)
                            sort_priority = getattr(runner, 'sort_priority', 0)
                        
                        # Extract prices from book data
                        back_prices = []
                        lay_prices = []
                        traded_volume = []
                        
                        # Find matching runner in the book data
                        if book and 'runners' in book:
                            for book_runner in book.get('runners', []):
                                if str(book_runner.get('selection_id')) == str(selection_id):
                                    ex = book_runner.get('ex', {})
                                    
                                    # Extract back prices
                                    available_to_back = ex.get('available_to_back', [])
                                    for i, price in enumerate(available_to_back[:3]):
                                        back_prices.append({
                                            'price': price.get('price', 0.0),
                                            'size': price.get('size', 0.0)
                                        })
                                    
                                    # Fill remaining slots if needed
                                    while len(back_prices) < 3:
                                        back_prices.append({'price': 0.0, 'size': 0.0})
                                        
                                    # Extract lay prices
                                    available_to_lay = ex.get('available_to_lay', [])
                                    for i, price in enumerate(available_to_lay[:3]):
                                        lay_prices.append({
                                            'price': price.get('price', 0.0),
                                            'size': price.get('size', 0.0)
                                        })
                                    
                                    # Fill remaining slots if needed
                                    while len(lay_prices) < 3:
                                        lay_prices.append({'price': 0.0, 'size': 0.0})
                                        
                                    traded_volume = ex.get('traded_volume', [])
                                    break
                        
                        # If no prices found, use default values
                        if not back_prices:
                            back_prices = [
                                {'price': 1.95, 'size': 100.0},
                                {'price': 1.94, 'size': 100.0},
                                {'price': 1.93, 'size': 100.0}
                            ]
                        if not lay_prices:
                            lay_prices = [
                                {'price': 2.02, 'size': 100.0},
                                {'price': 2.04, 'size': 100.0},
                                {'price': 2.06, 'size': 100.0}
                            ]
                        
                        # Create runner with all required fields in the exact order
                        runner_dict = OrderedDict([
                            ('marketId', result['marketId']),
                            ('selectionId', selection_id),
                            ('runnerName', runner_name),
                            ('handicap', handicap),
                            ('sortPriority', sort_priority),
                            ('status', 'ACTIVE'),
                            ('removalDate', None),
                            ('silkColor', ''),
                            ('score', None),
                            ('adjFactor', None),
                            ('metadata', '{\r\n  "runnerId": "' + str(selection_id) + '"\r\n}'),
                            ('jockeyName', ''),
                            ('trainerName', ''),
                            ('age', ''),
                            ('weight', ''),
                            ('lastRun', ''),
                            ('wearing', ''),
                            ('state', 0),
                            ('prices', {
                                'available_to_back': back_prices,
                                'available_to_lay': lay_prices,
                                'traded_volume': traded_volume
                            })
                        ])
                        
                        result['runners'].append(runner_dict)
                
                new_results.append(result)
                
                # Cache catalog in database
                try:
                    db = get_db()
                    db.market_catalogs.update_one(
                        {'market_id': market_id},
                        {'$set': {
                            'catalog': result,
                            'updated_at': datetime.utcnow()
                        }},
                        upsert=True
                    )
                except Exception as db_error:
                    logging.error(f"Database error when caching catalog {market_id}: {str(db_error)}")
            
            # Combine cached results with new results
            results.extend(new_results)
            
            return jsonify(results), 200
            
        except Exception as api_error:
            logging.error(f"Betfair API error: {str(api_error)}")
            return jsonify({
                'status': 'error',
                'message': f'Betfair API error: {str(api_error)}'
            }), 500
            
    except Exception as e:
        logging.error(f"Error getting market catalogs: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get market catalogs'
        }), 500

@markets_bp.route('/major-sports', methods=['GET'])
def get_major_sports():
    """Get only the 5 major sports (Soccer=1, Tennis=2, Cricket=4, Horse Race=7 & Greyhound Race=4339)"""
    try:
        # Define the major sport IDs
        major_sport_ids = ['1', '2', '4', '7', '4339']
        
        betfair_api = get_betfair_api()
        all_sports = betfair_api.get_event_types()
        
        # Filter to only include major sports
        major_sports = [sport for sport in all_sports if sport['id'] in major_sport_ids]
        
        # Cache major sports in database
        db = get_db()
        for sport in major_sports:
            db.sports.update_one(
                {'id': sport['id']},
                {'$set': {
                    'name': sport['name'],
                    'is_major': True,
                    'updated_at': datetime.utcnow()
                }},
                upsert=True
            )
        
        return jsonify({
            'status': 'success',
            'data': major_sports
        }), 200
    except Exception as e:
        logging.error(f"Error getting major sports: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get major sports'
        }), 500

from flask_restx import Api, Resource, fields, Namespace, reqparse
from flask import Blueprint, request
import werkzeug
from functools import wraps

# Create a Blueprint for the Swagger UI
swagger_bp = Blueprint('swagger', __name__, url_prefix='/api/docs')

# Create an API instance
api = Api(
    swagger_bp,
    version='1.0',
    title='BetPro Exchange API',
    description='''
    # BetPro Exchange API Documentation
    
    This API provides access to Betfair market data and betting functionality.
    
    ## Authentication
    Most endpoints require authentication using a Bearer token in the Authorization header.
    
    ```
    Authorization: Bearer your_jwt_token_here
    ```
    
    ## Rate Limits
    - Standard rate limit: 10 requests per second
    - Enhanced rate limit for premium users: 20 requests per second
    
    ## Response Formats
    All responses are in JSON format.
    ''',
    doc='/swagger',
    validate=True,
    authorizations={
        'Bearer Auth': {
            'type': 'apiKey',
            'in': 'header',
            'name': 'Authorization'
        }
    },
    security='Bearer Auth'
)

# Create namespaces for different API sections
markets_ns = api.namespace('Markets', description='Market data and catalog operations')

# Define models for request/response documentation
back_price_model = api.model('BackPrice', {
    'price': fields.Float(description='Available price to back', example=1.95),
    'size': fields.Float(description='Available size/stake at this price', example=1000.0)
})

lay_price_model = api.model('LayPrice', {
    'price': fields.Float(description='Available price to lay', example=2.0),
    'size': fields.Float(description='Available size/stake at this price', example=800.0)
})

traded_volume_model = api.model('TradedVolume', {
    'price': fields.Float(description='Price at which volume was traded', example=1.98),
    'size': fields.Float(description='Amount matched at this price', example=500.0)
})

exchange_model = api.model('Exchange', {
    'availableToBack': fields.List(fields.Nested(back_price_model), description='List of available back prices sorted by price ascending'),
    'availableToLay': fields.List(fields.Nested(lay_price_model), description='List of available lay prices sorted by price ascending'),
    'tradedVolume': fields.List(fields.Nested(traded_volume_model), description='List of traded volumes at different price points')
})

runner_model = api.model('Runner', {
    'selectionId': fields.Integer(description='Unique identifier for the selection/runner', example=12345678),
    'status': fields.String(description='Status of the runner (ACTIVE, REMOVED, WINNER, LOSER, etc.)', example='ACTIVE'),
    'totalMatched': fields.Float(description='Total amount matched on this runner', example=10000.0),
    'lastPriceTraded': fields.Float(description='Last price at which this runner was traded', example=1.98),
    'ex': fields.Nested(exchange_model, description='Exchange data for this runner')
})

market_data_model = api.model('MarketData', {
    'marketId': fields.String(description='Unique identifier for the market', example='1.12345678'),
    'isMarketDataDelayed': fields.Boolean(description='Whether market data is delayed due to subscription level', example=False),
    'status': fields.String(description='Market status (OPEN, SUSPENDED, CLOSED, etc.)', example='OPEN'),
    'betDelay': fields.Integer(description='Bet delay in seconds for in-play markets', example=5),
    'totalMatched': fields.Float(description='Total amount matched on this market across all selections', example=25000.0),
    'runners': fields.List(fields.Nested(runner_model), description='List of runners/selections in this market')
})

competition_model = api.model('Competition', {
    'id': fields.String(description='Unique identifier for the competition', example='12345'),
    'name': fields.String(description='Name of the competition', example='English Premier League')
})

event_model = api.model('Event', {
    'id': fields.String(description='Unique identifier for the event', example='30741689'),
    'name': fields.String(description='Name of the event', example='Arsenal v Chelsea'),
    'countryCode': fields.String(description='ISO country code for the event', example='GB'),
    'timezone': fields.String(description='Timezone in which the event takes place', example='Europe/London'),
    'openDate': fields.String(description='Date and time when the event opens for betting', example='2025-06-25T15:00:00.000Z')
})

event_type_model = api.model('EventType', {
    'id': fields.String(description='Unique identifier for the event type', example='1'),
    'name': fields.String(description='Name of the event type', example='Soccer')
})

catalog_runner_model = api.model('CatalogRunner', {
    'selectionId': fields.Integer(description='Unique identifier for the selection/runner', example=12345678),
    'runnerName': fields.String(description='Name of the runner/selection', example='Arsenal'),
    'handicap': fields.Float(description='Handicap applied to this runner (if applicable)', example=0.0),
    'sortPriority': fields.Integer(description='Priority used for sorting runners (lower = higher priority)', example=1)
})

market_catalog_model = api.model('MarketCatalog', {
    'marketId': fields.String(description='Unique identifier for the market', example='1.12345678'),
    'marketName': fields.String(description='Name of the market', example='Match Odds'),
    'totalMatched': fields.Float(description='Total amount matched on this market across all selections', example=25000.0),
    'marketStartTime': fields.String(description='Date and time when the market starts', example='2025-06-25T15:00:00.000Z'),
    'competition': fields.Nested(competition_model, description='Information about the competition this market belongs to'),
    'event': fields.Nested(event_model, description='Information about the event this market belongs to'),
    'eventType': fields.Nested(event_type_model, description='Type of event (e.g., Soccer, Horse Racing, Tennis)'),
    'runners': fields.List(fields.Nested(catalog_runner_model), description='List of runners/selections in this market')
})

# Error models
error_model = api.model('Error', {
    'error': fields.String(description='Error message', example='Market not found'),
    'status': fields.Integer(description='HTTP status code', example=404),
    'timestamp': fields.String(description='Timestamp of the error', example='2025-06-25T12:34:56.789Z')
})

# Request parsers
market_id_parser = reqparse.RequestParser()
market_id_parser.add_argument('id', type=str, required=True, help='Market ID is required (e.g., 1.12345678)', location='args')

market_ids_parser = reqparse.RequestParser()
market_ids_parser.add_argument('ids', type=str, required=True, 
                             help='Comma-separated list of market IDs is required (e.g., 1.12345678,1.87654321)', location='args')
market_ids_parser.add_argument('id', type=str, required=False, 
                             help='Alternative: Single market ID or comma-separated list', location='args')

# Define the API endpoints
@markets_ns.route('/Data')
@markets_ns.doc(security='Bearer Auth')
class MarketData(Resource):
    @markets_ns.doc('get_market_data', 
                   description='Retrieves detailed market data including prices, matched amounts, and runner status',
                   params={'id': {'description': 'Unique identifier for the market', 'example': '1.12345678'}})
    @markets_ns.expect(market_id_parser)
    @markets_ns.response(200, 'Success', market_data_model)
    @markets_ns.response(400, 'Invalid request', error_model)
    @markets_ns.response(401, 'Unauthorized - Invalid or expired token', error_model)
    @markets_ns.response(404, 'Market not found', error_model)
    @markets_ns.response(429, 'Too many requests - Rate limit exceeded', error_model)
    @markets_ns.response(500, 'Server error', error_model)
    def get(self):
        """
        Get market data by market ID
        
        Returns detailed market data including prices, matched amounts, and runner status.
        This endpoint provides real-time or near real-time pricing data from the Betfair exchange.
        
        The data includes:
        - Market status and information
        - Runner/selection details
        - Available back and lay prices
        - Matched amounts and volumes
        
        Results are cached for 1-2 seconds to optimize performance.
        """
        return {'message': 'This is a documentation endpoint. Use the actual API endpoint to get real data.'}

@markets_ns.route('/catalog2')
@markets_ns.doc(security='Bearer Auth')
class MarketCatalog(Resource):
    @markets_ns.doc('get_market_catalog',
                   description='Retrieves market catalog information for a single market',
                   params={'id': {'description': 'Unique identifier for the market', 'example': '1.12345678'}})
    @markets_ns.expect(market_id_parser)
    @markets_ns.response(200, 'Success', market_catalog_model)
    @markets_ns.response(400, 'Invalid request', error_model)
    @markets_ns.response(401, 'Unauthorized - Invalid or expired token', error_model)
    @markets_ns.response(404, 'Market not found', error_model)
    @markets_ns.response(429, 'Too many requests - Rate limit exceeded', error_model)
    @markets_ns.response(500, 'Server error', error_model)
    def get(self):
        """
        Get market catalog by market ID
        
        Returns market catalog information including event details, competition, and runners.
        This endpoint provides metadata about markets rather than pricing information.
        
        The catalog includes:
        - Market details (name, start time)
        - Event information
        - Competition details
        - Runner/selection names and metadata
        
        Results are cached for up to 5 minutes to optimize performance.
        """
        return {'message': 'This is a documentation endpoint. Use the actual API endpoint to get real data.'}

@markets_ns.route('/catalogs')
@markets_ns.doc(security='Bearer Auth')
class MultipleCatalogs(Resource):
    @markets_ns.doc('get_multiple_catalogs',
                   description='Retrieves market catalog information for multiple markets in a single request',
                   params={
                       'ids': {'description': 'Comma-separated list of market IDs', 'example': '1.12345678,1.87654321'},
                       'id': {'description': 'Alternative: Single market ID or comma-separated list', 'example': '1.12345678'}
                   })
    @markets_ns.expect(market_ids_parser)
    @markets_ns.response(200, 'Success', [market_catalog_model])
    @markets_ns.response(400, 'Invalid request', error_model)
    @markets_ns.response(401, 'Unauthorized - Invalid or expired token', error_model)
    @markets_ns.response(404, 'Markets not found', error_model)
    @markets_ns.response(429, 'Too many requests - Rate limit exceeded', error_model)
    @markets_ns.response(500, 'Server error', error_model)
    def get(self):
        """
        Get multiple market catalogs by IDs
        
        Returns catalog information for multiple markets in a single request.
        This endpoint is optimized for batch retrieval of market metadata.
        
        The response is an array of market catalogs, each containing:
        - Market details (name, start time)
        - Event information
        - Competition details
        - Runner/selection names and metadata
        
        Results are cached for up to 5 minutes to optimize performance.
        Maximum of 25 market IDs can be requested in a single call.
        """
        return {'message': 'This is a documentation endpoint. Use the actual API endpoint to get real data.'}

from flask import Blueprint, request, jsonify
import uuid
import logging

mock_data_bp = Blueprint('mock_data', __name__)

@mock_data_bp.route('/market_data', methods=['GET'])
def get_mock_market_data():
    """Return mock market data in the required format"""
    try:
        market_id = request.args.get('id', '1.245074690')
        
        # Create a mock response in the exact format required, matching the target format
        mock_response = {
            "requestId": "9201a1d6-6c0e-4a2b-81b9-2e4777a2fdc5",
            "marketBooks": [
                {
                    "id": market_id,
                    "winners": 1,
                    "betDelay": 0,
                    "totalMatched": 35470.82,
                    "marketStatus": "OPEN",
                    "maxBetSize": 0,
                    "bettingAllowed": True,
                    "isMarketDataDelayed": False,
                    "runners": [
                        {
                            "id": "10301",
                            "price1": 1.69,
                            "price2": 1.68,
                            "price3": 1.67,
                            "size1": 7183.11,
                            "size2": 10305.7,
                            "size3": 55.66,
                            "lay1": 1.74,
                            "lay2": 1.75,
                            "lay3": 1.76,
                            "ls1": 20.81,
                            "ls2": 433.14,
                            "ls3": 3686.62,
                            "status": "ACTIVE",
                            "handicap": 0
                        },
                        {
                            "id": "414464",
                            "price1": 3.2,
                            "price2": 3.15,
                            "price3": 3.1,
                            "size1": 14048.31,
                            "size2": 149.82,
                            "size3": 8734.91,
                            "lay1": 3.4,
                            "lay2": 3.45,
                            "lay3": 3.5,
                            "ls1": 53.63,
                            "ls2": 542.55,
                            "ls3": 3546.85,
                            "status": "ACTIVE",
                            "handicap": 0
                        },
                        {
                            "id": "60443",
                            "price1": 8.4,
                            "price2": 8.2,
                            "price3": 8,
                            "size1": 784.43,
                            "size2": 2584.98,
                            "size3": 534.29,
                            "lay1": 8.8,
                            "lay2": 9,
                            "lay3": 9.2,
                            "ls1": 32.18,
                            "ls2": 141.84,
                            "ls3": 1088.13,
                            "status": "ACTIVE",
                            "handicap": 0
                        }
                    ],
                    "isRoot": False,
                    "timestamp": "0001-01-01T00:00:00",
                    "winnerIDs": []
                }
            ],
            "news": "",
            "scores": {
                "currentSet": 0
            }
        }
        
        return jsonify(mock_response), 200
    except Exception as e:
        logging.error(f"Error in mock data endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get mock market data'
        }), 500

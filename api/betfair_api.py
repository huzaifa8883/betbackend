import requests
import json
import logging
import os
from datetime import datetime, timedelta
import betfairlightweight
from betfairlightweight import filters

class BetfairAPI:
    """
    Wrapper for Betfair API operations using betfairlightweight library
    """
    
    def __init__(self, app_key, session_token):
        self.app_key = app_key
        self.session_token = session_token
        self.client = None
        self.initialize_client()
        
    def initialize_client(self):
        """Initialize the Betfair API client"""
        try:
            self.client = betfairlightweight.APIClient(
                username="",  # Not needed when using session token
                password="",  # Not needed when using session token
                app_key=self.app_key,
                cert_files=None,
                lightweight=True
            )
            # Set the session token directly
            self.client.session_token = self.session_token
            # No need to call login_interactive when using a session token
            logging.info("Betfair API client initialized successfully with session token")
        except Exception as e:
            logging.error(f"Failed to initialize Betfair API client: {str(e)}")
            raise
    
    def get_event_types(self):
        """Get all event types (sports)"""
        try:
            event_filter = filters.market_filter(text_query=None)
            event_types = self.client.betting.list_event_types(
                filter=event_filter
            )
            result = []
            
            # Handle different response formats
            for event_type in event_types:
                try:
                    # Try the object-based format first
                    if hasattr(event_type, 'event_type') and hasattr(event_type.event_type, 'id'):
                        result.append({
                            "id": event_type.event_type.id,
                            "name": event_type.event_type.name,
                        })
                    # Try dictionary format
                    elif isinstance(event_type, dict) and 'eventType' in event_type:
                        result.append({
                            "id": event_type['eventType']['id'],
                            "name": event_type['eventType']['name'],
                        })
                    # Direct format
                    elif isinstance(event_type, dict) and 'id' in event_type:
                        result.append({
                            "id": event_type['id'],
                            "name": event_type['name'],
                        })
                except Exception as item_error:
                    logging.error(f"Error processing event type: {str(item_error)}")
                    # Log the event_type structure for debugging
                    logging.error(f"Event type structure: {str(event_type)}")
            
            return result
        except Exception as e:
            logging.error(f"Error getting event types: {str(e)}")
            return []
    
    def get_competitions(self, event_type_id=None):
        """Get competitions for a specific sport"""
        try:
            competition_filter = filters.market_filter(
                event_type_ids=[event_type_id] if event_type_id else None
            )
            competitions = self.client.betting.list_competitions(
                filter=competition_filter
            )
            return [
                {
                    "id": competition.competition.id,
                    "name": competition.competition.name,
                    "region": competition.competition_region
                }
                for competition in competitions
            ]
        except Exception as e:
            logging.error(f"Error getting competitions: {str(e)}")
            return []
    
    def get_events(self, event_type_id=None, competition_id=None):
        """Get events for a specific sport or competition"""
        try:
            event_filter = filters.market_filter(
                event_type_ids=[event_type_id] if event_type_id else None,
                competition_ids=[competition_id] if competition_id else None,
                market_start_time={
                    'from': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'to': (datetime.utcnow() + timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
                }
            )
            events = self.client.betting.list_events(
                filter=event_filter
            )
            
            result = []
            for event in events:
                try:
                    # Try object-based format
                    if hasattr(event, 'event') and hasattr(event.event, 'id'):
                        result.append({
                            "id": event.event.id,
                            "name": event.event.name,
                            "country_code": getattr(event.event, 'country_code', None),
                            "timezone": getattr(event.event, 'timezone', None),
                            "open_date": getattr(event.event, 'open_date', None)
                        })
                    # Try dictionary format
                    elif isinstance(event, dict) and 'event' in event:
                        result.append({
                            "id": event['event']['id'],
                            "name": event['event']['name'],
                            "country_code": event['event'].get('countryCode'),
                            "timezone": event['event'].get('timezone'),
                            "open_date": event['event'].get('openDate')
                        })
                    # Direct format
                    elif isinstance(event, dict) and 'id' in event:
                        result.append({
                            "id": event['id'],
                            "name": event['name'],
                            "country_code": event.get('countryCode'),
                            "timezone": event.get('timezone'),
                            "open_date": event.get('openDate')
                        })
                except Exception as item_error:
                    logging.error(f"Error processing event: {str(item_error)}")
                    logging.error(f"Event structure: {str(event)}")
            
            return result
        except Exception as e:
            logging.error(f"Error getting events: {str(e)}")
            return []
    
    def get_markets(self, event_id=None, market_types=None):
        """Get markets for a specific event"""
        try:
            if not market_types:
                market_types = ["MATCH_ODDS", "OVER_UNDER_25", "CORRECT_SCORE"]
                
            market_filter = filters.market_filter(
                event_ids=[event_id] if event_id else None,
                market_type_codes=market_types
            )
            markets = self.client.betting.list_market_catalogue(
                filter=market_filter,
                max_results=100,
                market_projection=["COMPETITION", "EVENT", "EVENT_TYPE", "RUNNER_DESCRIPTION", "MARKET_START_TIME"]
            )
            
            result = []
            for market in markets:
                try:
                    market_data = {}
                    
                    # Try object-based format
                    if hasattr(market, 'market_id'):
                        market_data = {
                            "marketId": market.market_id,  # Use marketId for consistency
                            "marketName": market.market_name,  # Use marketName for consistency
                            "market_start_time": market.market_start_time,
                            "total_matched": getattr(market, 'total_matched', 0),
                            "runners": []
                        }
                        
                        # Process runners if available
                        if hasattr(market, 'runners') and market.runners:
                            for runner in market.runners:
                                if hasattr(runner, 'selection_id'):
                                    market_data["runners"].append({
                                        "id": runner.selection_id,
                                        "name": runner.runner_name,
                                        "handicap": getattr(runner, 'handicap', 0),
                                        "sort_priority": getattr(runner, 'sort_priority', 0)
                                    })
                    
                    # Try dictionary format
                    elif isinstance(market, dict):
                        market_data = {
                            "marketId": market.get('marketId'),
                            "marketName": market.get('marketName'),
                            "market_start_time": market.get('marketStartTime'),
                            "total_matched": market.get('totalMatched', 0),
                            "runners": []
                        }
                        
                        # Process runners if available
                        if 'runners' in market and market['runners']:
                            for runner in market['runners']:
                                market_data["runners"].append({
                                    "id": runner.get('selectionId'),
                                    "name": runner.get('runnerName'),
                                    "handicap": runner.get('handicap', 0),
                                    "sort_priority": runner.get('sortPriority', 0)
                                })
                    
                    # Only add valid market data
                    if market_data.get('marketId'):
                        result.append(market_data)
                        
                except Exception as item_error:
                    logging.error(f"Error processing market: {str(item_error)}")
                    logging.error(f"Market structure: {str(market)}")
            
            return result
        except Exception as e:
            logging.error(f"Error getting markets: {str(e)}")
            return []
    
    def get_market_book(self, market_ids):
        """Get market book for specific markets"""
        try:
            if isinstance(market_ids, str):
                market_ids = [market_ids]
                
            logging.info(f"Fetching market book for IDs: {market_ids}")
            
            # Check if client is initialized
            if not self.client:
                logging.error("Betfair client is not initialized")
                self.initialize_client()
                if not self.client:
                    return []
                    
            try:
                # Try to check session status
                self.client.session_token
                logging.info(f"Session token exists: {self.client.session_token[:10]}...")
            except Exception as session_error:
                logging.error(f"Session token error: {str(session_error)}")
                # Re-initialize client if session is invalid
                self.initialize_client()
                
            price_filter = filters.price_projection(
                price_data=["EX_BEST_OFFERS", "EX_TRADED"],
                ex_best_offers_overrides=filters.ex_best_offers_overrides(best_prices_depth=3)
            )
            
            # Add explicit error handling for API call
            try:
                market_books = self.client.betting.list_market_book(
                    market_ids=market_ids,
                    price_projection=price_filter
                )
                logging.info(f"Received {len(market_books)} market books from API")
            except Exception as api_error:
                logging.error(f"API call failed: {str(api_error)}")
                return []
                
            if not market_books:
                logging.warning(f"No market books found for IDs: {market_ids}")
                return []
                
            result = []
            for book in market_books:
                # Check if book is a dictionary or an object
                if isinstance(book, dict):
                    # It's a dictionary, access with get()
                    market_dict = {
                        "market_id": book.get('marketId') or book.get('market_id'),
                        "is_market_data_delayed": book.get('isMarketDataDelayed') or book.get('is_market_data_delayed'),
                        "status": book.get('status'),
                        "bet_delay": book.get('betDelay') or book.get('bet_delay'),
                        "total_matched": book.get('totalMatched') or book.get('total_matched'),
                        "runners": []
                    }
                    
                    # Process runners if they exist
                    runners = book.get('runners', [])
                    for runner in runners:
                        runner_dict = {
                            "selection_id": runner.get('selectionId') or runner.get('selection_id'),
                            "status": runner.get('status'),
                            "total_matched": runner.get('totalMatched') or runner.get('total_matched'),
                            "last_price_traded": runner.get('lastPriceTraded') or runner.get('last_price_traded'),
                            "ex": {}
                        }
                        
                        # Process exchange data
                        ex = runner.get('ex', {})
                        runner_dict["ex"] = {
                            "available_to_back": ex.get('availableToBack', []) or ex.get('available_to_back', []),
                            "available_to_lay": ex.get('availableToLay', []) or ex.get('available_to_lay', []),
                            "traded_volume": ex.get('tradedVolume', []) or ex.get('traded_volume', [])
                        }
                        
                        market_dict["runners"].append(runner_dict)
                else:
                    # It's an object, access with attribute notation
                    market_dict = {
                        "market_id": book.market_id if hasattr(book, 'market_id') else None,
                        "is_market_data_delayed": book.is_market_data_delayed if hasattr(book, 'is_market_data_delayed') else None,
                        "status": book.status if hasattr(book, 'status') else None,
                        "bet_delay": book.bet_delay if hasattr(book, 'bet_delay') else None,
                        "total_matched": book.total_matched if hasattr(book, 'total_matched') else None,
                        "runners": []
                    }
                    
                    # Process runners if they exist
                    if hasattr(book, 'runners') and book.runners:
                        for runner in book.runners:
                            runner_dict = {
                                "selection_id": runner.selection_id if hasattr(runner, 'selection_id') else None,
                                "status": runner.status if hasattr(runner, 'status') else None,
                                "total_matched": runner.total_matched if hasattr(runner, 'total_matched') else None,
                                "last_price_traded": runner.last_price_traded if hasattr(runner, 'last_price_traded') else None,
                                "ex": {}
                            }
                            
                            # Process exchange data
                            if hasattr(runner, 'ex') and runner.ex:
                                ex_dict = {}
                                
                                # Available to back prices
                                if hasattr(runner.ex, 'available_to_back') and runner.ex.available_to_back:
                                    ex_dict["available_to_back"] = [
                                        {"price": p.price, "size": p.size}
                                        for p in runner.ex.available_to_back
                                    ]
                                else:
                                    ex_dict["available_to_back"] = []
                                    
                                # Available to lay prices
                                if hasattr(runner.ex, 'available_to_lay') and runner.ex.available_to_lay:
                                    ex_dict["available_to_lay"] = [
                                        {"price": p.price, "size": p.size}
                                        for p in runner.ex.available_to_lay
                                    ]
                                else:
                                    ex_dict["available_to_lay"] = []
                                    
                                # Traded volume
                                if hasattr(runner.ex, 'traded_volume') and runner.ex.traded_volume:
                                    ex_dict["traded_volume"] = [
                                        {"price": p.price, "size": p.size}
                                        for p in runner.ex.traded_volume
                                    ]
                                else:
                                    ex_dict["traded_volume"] = []
                                    
                                runner_dict["ex"] = ex_dict
                            
                            market_dict["runners"].append(runner_dict)
                
                result.append(market_dict)
            
            logging.info(f"Processed market books successfully")
            return result
        except Exception as e:
            import traceback
            logging.error(f"Error getting market book: {str(e)}")
            logging.error(traceback.format_exc())
            return []
    
    def place_bet(self, market_id, selection_id, side, price, size, customer_ref=None):
        """Place a bet on a market"""
        try:
            if side.upper() not in ["BACK", "LAY"]:
                raise ValueError("Side must be either 'BACK' or 'LAY'")
                
            instructions = [
                {
                    'selectionId': selection_id,
                    'handicap': 0,
                    'side': side.upper(),
                    'orderType': 'LIMIT',
                    'limitOrder': {
                        'size': size,
                        'price': price,
                        'persistenceType': 'LAPSE'
                    }
                }
            ]
            
            response = self.client.betting.place_orders(
                market_id=market_id,
                instructions=instructions,
                customer_order_ref=customer_ref
            )
            
            return {
                "status": "success" if response.status == "SUCCESS" else "failure",
                "bet_id": response.instruction_reports[0].bet_id if response.instruction_reports else None,
                "placed_date": response.instruction_reports[0].placed_date if response.instruction_reports else None,
                "average_price_matched": response.instruction_reports[0].average_price_matched if response.instruction_reports else None,
                "size_matched": response.instruction_reports[0].size_matched if response.instruction_reports else None,
                "error": response.error_code if hasattr(response, 'error_code') and response.error_code else None
            }
        except Exception as e:
            logging.error(f"Error placing bet: {str(e)}")
            return {
                "status": "failure",
                "error": str(e)
            }
    
    def cancel_bet(self, bet_id, market_id, size_reduction=None):
        """Cancel a bet"""
        try:
            instructions = [
                {
                    'bet_id': bet_id,
                    'size_reduction': size_reduction
                }
            ]
            
            response = self.client.betting.cancel_orders(
                market_id=market_id,
                instructions=instructions
            )
            
            return {
                "status": "success" if response.status == "SUCCESS" else "failure",
                "cancelled_date": response.instruction_reports[0].cancelled_date if response.instruction_reports else None,
                "size_cancelled": response.instruction_reports[0].size_cancelled if response.instruction_reports else None,
                "error": response.error_code if hasattr(response, 'error_code') and response.error_code else None
            }
        except Exception as e:
            logging.error(f"Error cancelling bet: {str(e)}")
            return {
                "status": "failure",
                "error": str(e)
            }

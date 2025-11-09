"""Bet service for the BetPro Backend application.

This module provides the BetService class for handling betting operations
and bet management.
"""
import logging
from datetime import datetime
from bson import ObjectId
from models.bet import Bet
from services.base_service import BaseService
from services.user_service import UserService
from utils.cache import session_cached, request_cached

class BetService(BaseService):
    """Bet service for handling betting operations."""
    
    def __init__(self):
        """Initialize the bet service."""
        super().__init__('bets')
        self.user_service = UserService()
        self.logger = logging.getLogger('service.bet')
    
    def place_bet(self, user_id, event_id, market_id, selection_id, stake, odds,
                 bet_type='BACK', event_name=None, market_name=None, selection_name=None):
        """Place a new bet."""
        try:
            # Get the user
            user = self.user_service.get_user_by_id(user_id)
            if not user:
                return None, "User not found"
            
            # Check if user has enough balance
            if user.wallet_balance < stake:
                return None, "Insufficient balance"
            
            # Create bet object
            bet = Bet(
                user_id=user_id,
                username=user.username,
                event_id=event_id,
                event_name=event_name,
                market_id=market_id,
                market_name=market_name,
                selection_id=selection_id,
                selection_name=selection_name,
                stake=stake,
                odds=odds,
                bet_type=bet_type
            )
            
            # Insert bet
            bet_dict = bet.to_dict()
            bet_id = self.insert_one(bet_dict)
            
            if not bet_id:
                return None, "Failed to create bet"
            
            # Update user's wallet balance
            success, transaction_id, error = self.user_service.update_wallet_balance(
                user_id=user_id,
                amount=-stake,  # Deduct stake from balance
                transaction_type='bet',
                description=f"Bet placed on {selection_name or 'selection'} at odds {odds}",
                reference_id=str(bet_id)
            )
            
            if not success:
                # Rollback bet if wallet update fails
                self.delete_by_id(bet_id)
                return None, error or "Failed to update wallet balance"
            
            # Update bet with transaction ID
            self.update_by_id(bet_id, {
                "transaction_id": str(transaction_id),
                "status": Bet.STATUS_MATCHED
            })
            
            return bet_id, None
        except Exception as e:
            self.logger.error(f"Error placing bet: {e}")
            return None, str(e)
    
    def settle_bet(self, bet_id, result, profit_loss=None, commission=0.0):
        """Settle a bet with a result."""
        try:
            # Get the bet
            bet_data = self.find_by_id(bet_id)
            if not bet_data:
                return False, "Bet not found"
            
            # Check if bet is already settled
            if bet_data.get('status') == Bet.STATUS_SETTLED:
                return False, "Bet already settled"
            
            # Create bet object
            bet = Bet.from_dict(bet_data)
            
            # Settle the bet
            calculated_profit_loss = bet.settle(result, profit_loss, commission)
            
            # Update bet in database
            self.update_by_id(bet_id, {
                "result": result,
                "status": Bet.STATUS_SETTLED,
                "profit_loss": calculated_profit_loss,
                "commission": commission,
                "settled_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            })
            
            # Update user's wallet balance if bet is won
            if result in [Bet.RESULT_WIN, Bet.RESULT_HALF_WIN] and calculated_profit_loss > 0:
                # For wins, add profit (not stake) to balance
                amount_to_add = calculated_profit_loss
                
                # For back bets, also return the stake
                if bet.bet_type == Bet.TYPE_BACK:
                    amount_to_add += bet.stake
                
                # Deduct commission if any
                amount_to_add -= commission
                
                # Update wallet
                success, transaction_id, error = self.user_service.update_wallet_balance(
                    user_id=bet.user_id,
                    amount=amount_to_add,
                    transaction_type='win',
                    description=f"Win from bet on {bet.selection_name or 'selection'} at odds {bet.odds}",
                    reference_id=str(bet_id)
                )
                
                if not success:
                    return False, error or "Failed to update wallet balance"
            
            # For void bets, return the stake
            elif result == Bet.RESULT_VOID:
                success, transaction_id, error = self.user_service.update_wallet_balance(
                    user_id=bet.user_id,
                    amount=bet.stake,
                    transaction_type='refund',
                    description=f"Refund from voided bet on {bet.selection_name or 'selection'}",
                    reference_id=str(bet_id)
                )
                
                if not success:
                    return False, error or "Failed to update wallet balance"
            
            return True, None
        except Exception as e:
            self.logger.error(f"Error settling bet: {e}")
            return False, str(e)
    
    def cancel_bet(self, bet_id):
        """Cancel a bet and refund the stake."""
        try:
            # Get the bet
            bet_data = self.find_by_id(bet_id)
            if not bet_data:
                return False, "Bet not found"
            
            # Check if bet can be cancelled
            if bet_data.get('status') not in [Bet.STATUS_PENDING, Bet.STATUS_MATCHED]:
                return False, "Bet cannot be cancelled"
            
            # Create bet object
            bet = Bet.from_dict(bet_data)
            
            # Cancel the bet
            bet.cancel()
            
            # Update bet in database
            self.update_by_id(bet_id, {
                "status": Bet.STATUS_CANCELLED,
                "updated_at": datetime.utcnow()
            })
            
            # Refund the stake
            success, transaction_id, error = self.user_service.update_wallet_balance(
                user_id=bet.user_id,
                amount=bet.stake,
                transaction_type='refund',
                description=f"Refund from cancelled bet on {bet.selection_name or 'selection'}",
                reference_id=str(bet_id)
            )
            
            if not success:
                return False, error or "Failed to refund stake"
            
            return True, None
        except Exception as e:
            self.logger.error(f"Error cancelling bet: {e}")
            return False, str(e)
    
    def get_user_bets(self, user_id, status=None, limit=20, skip=0):
        """Get bets for a user."""
        try:
            query = {"user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id}
            
            if status:
                query["status"] = status
            
            bets = self.find_many(
                query=query,
                sort=[("created_at", -1)],
                limit=limit,
                skip=skip
            )
            
            return [Bet.from_dict(bet) for bet in bets]
        except Exception as e:
            self.logger.error(f"Error getting user bets: {e}")
            return []
    
    def get_event_bets(self, event_id, limit=100, skip=0):
        """Get bets for an event."""
        try:
            bets = self.find_many(
                query={"event_id": event_id},
                sort=[("created_at", -1)],
                limit=limit,
                skip=skip
            )
            
            return [Bet.from_dict(bet) for bet in bets]
        except Exception as e:
            self.logger.error(f"Error getting event bets: {e}")
            return []
    
    @session_cached(ttl=300, key_prefix='bet_stats')
    @request_cached
    def get_bet_stats(self):
        """Get statistics about bets."""
        try:
            # Count bets by status
            status_pipeline = [
                {"$group": {"_id": "$status", "count": {"$sum": 1}, "total_stake": {"$sum": "$stake"}}}
            ]
            status_results = self.aggregate(status_pipeline)
            
            # Count bets by result
            result_pipeline = [
                {"$match": {"result": {"$ne": None}}},
                {"$group": {"_id": "$result", "count": {"$sum": 1}, "total_profit_loss": {"$sum": "$profit_loss"}}}
            ]
            result_results = self.aggregate(result_pipeline)
            
            # Count bets by type
            type_pipeline = [
                {"$group": {"_id": "$bet_type", "count": {"$sum": 1}, "total_stake": {"$sum": "$stake"}}}
            ]
            type_results = self.aggregate(type_pipeline)
            
            # Format results
            status_stats = {result['_id']: {
                'count': result['count'],
                'total_stake': result['total_stake']
            } for result in status_results}
            
            result_stats = {result['_id']: {
                'count': result['count'],
                'total_profit_loss': result['total_profit_loss']
            } for result in result_results}
            
            type_stats = {result['_id']: {
                'count': result['count'],
                'total_stake': result['total_stake']
            } for result in type_results}
            
            # Calculate totals
            total_bets = self.count()
            total_stake = sum(stat['total_stake'] for stat in status_stats.values())
            total_profit_loss = sum(stat['total_profit_loss'] for stat in result_stats.values())
            
            return {
                'total_bets': total_bets,
                'total_stake': total_stake,
                'total_profit_loss': total_profit_loss,
                'bets_by_status': status_stats,
                'bets_by_result': result_stats,
                'bets_by_type': type_stats
            }
        except Exception as e:
            self.logger.error(f"Error getting bet stats: {e}")
            return {
                'total_bets': 0,
                'total_stake': 0,
                'total_profit_loss': 0,
                'bets_by_status': {},
                'bets_by_result': {},
                'bets_by_type': {}
            }

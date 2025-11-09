"""
Caching utilities for the BetPro Backend application.

This module provides caching mechanisms to improve application performance
by storing frequently accessed data in memory.
"""
import time
import functools
from flask import g, current_app, session
import logging

class SimpleCache:
    """Simple in-memory cache implementation"""
    
    def __init__(self):
        self._cache = {}
    
    def get(self, key):
        """Get value from cache if it exists and is not expired"""
        if key not in self._cache:
            return None
        
        item = self._cache[key]
        if item['expiry'] < time.time():
            # Item has expired
            del self._cache[key]
            return None
            
        return item['value']
    
    def set(self, key, value, ttl=300):
        """Set value in cache with expiration time"""
        self._cache[key] = {
            'value': value,
            'expiry': time.time() + ttl
        }
    
    def delete(self, key):
        """Delete item from cache"""
        if key in self._cache:
            del self._cache[key]
    
    def clear(self):
        """Clear all items from cache"""
        self._cache.clear()

# Global cache instance
_cache = SimpleCache()

def get_cache():
    """Get the cache instance"""
    return _cache

def cached(ttl=300, key_prefix=''):
    """
    Decorator to cache function results.
    
    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key
        
    Returns:
        Decorated function
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Try to get from cache
            cached_result = _cache.get(cache_key)
            if cached_result is not None:
                logging.debug(f"Cache hit for {cache_key}")
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            _cache.set(cache_key, result, ttl)
            logging.debug(f"Cache miss for {cache_key}, stored with TTL {ttl}s")
            
            return result
        return wrapper
    return decorator

def session_cached(ttl=300, key_prefix=''):
    """
    Decorator to cache function results in Flask session.
    
    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key
        
    Returns:
        Decorated function
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Check if we have it in session
            now = time.time()
            if cache_key in session and 'value' in session[cache_key] and 'expiry' in session[cache_key]:
                if session[cache_key]['expiry'] > now:
                    logging.debug(f"Session cache hit for {cache_key}")
                    return session[cache_key]['value']
            
            # Execute function and cache result in session
            result = func(*args, **kwargs)
            session[cache_key] = {
                'value': result,
                'expiry': now + ttl
            }
            logging.debug(f"Session cache miss for {cache_key}, stored with TTL {ttl}s")
            
            return result
        return wrapper
    return decorator

def request_cached(func):
    """
    Decorator to cache function results for the duration of a request.
    
    Args:
        func: Function to decorate
        
    Returns:
        Decorated function
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # Generate cache key
        cache_key = f"request_cache:{func.__name__}:{str(args)}:{str(kwargs)}"
        
        # Check if we have it in request context
        if hasattr(g, cache_key):
            logging.debug(f"Request cache hit for {cache_key}")
            return getattr(g, cache_key)
        
        # Execute function and cache result in request context
        result = func(*args, **kwargs)
        setattr(g, cache_key, result)
        logging.debug(f"Request cache miss for {cache_key}")
        
        return result
    return wrapper

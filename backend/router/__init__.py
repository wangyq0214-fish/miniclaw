"""
Router module - Intent classification and fast response routing.
"""
from .intent_classifier import intent_classifier, IntentType
from .fast_responder import fast_responder

__all__ = ["intent_classifier", "fast_responder", "IntentType"]

"""Stub Firebase so tests run without credentials or network."""
import os
import sys
import types
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

fake_firebase_config = types.ModuleType("firebase_config")
fake_firebase_config.db = MagicMock()
sys.modules["firebase_config"] = fake_firebase_config

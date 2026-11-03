"""Explicit operator-verified browser identity recovery; no automatic owner fallback."""
import hashlib
import json
import os
import re


def owner_for_token(token):
    owner = hashlib.sha256(token.encode()).hexdigest()
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        return owner
    try:
        aliases = json.loads(os.getenv('VEYA_BROWSER_OWNER_ALIASES', '{}'))
    except ValueError:
        return owner
    target = aliases.get(owner) if isinstance(aliases, dict) else None
    return target if isinstance(target, str) and re.fullmatch(r'[a-f0-9]{64}', target) else owner

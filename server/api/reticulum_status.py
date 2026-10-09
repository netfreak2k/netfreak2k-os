"""Normalize untrusted Reticulum runtime status before returning it to OS users.

Never equate a local running process with a verified remote path.
"""
import time

ALLOWED_STATES = frozenset({
    "disabled", "error", "local_instance_started",
    "runtime_status_unavailable", "integration_pending"
})

def public_status(raw, *, now=None):
    fallback = {
        "available": False, "connected": None, "state": "runtime_status_unavailable",
        "enabled": False, "transport_enabled": False, "interfaces": [],
    }
    if not isinstance(raw, dict):
        return fallback
    now = int(time.time()) if now is None else int(now)
    timestamp = raw.get("updated_at")
    if type(timestamp) is not int or not 0 <= now - timestamp <= 45:
        return fallback
    state = raw.get("state")
    if state not in ALLOWED_STATES:
        return fallback
    enabled = raw.get("enabled") is True
    available = raw.get("available") is True and state == "local_instance_started" and enabled
    # No remote path probe has been implemented. Never return connected=True.
    return {
        "available": available,
        "connected": None,
        "state": state,
        "enabled": enabled,
        "transport_enabled": available and raw.get("transport_enabled") is True,
        "interfaces": [],
        "updated_at": timestamp,
        "note": "Local runtime reported; remote Reticulum path unverified",
    }

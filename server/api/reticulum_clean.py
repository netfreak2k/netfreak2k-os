"""Read-only, minimal Reticulum/LXMF status model for the clean OS integration.

No Docker control, no identity writes, and no activation side effects.
"""
from pathlib import Path
import json


def status_from_file(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("status_not_object")
        return {
            "available": True,
            "connected": bool(data.get("connected", False)),
            "transport_enabled": bool(data.get("transport_enabled", False)),
            "source": "local_status_file",
            "read_only": True,
        }
    except (OSError, ValueError, TypeError):
        return {
            "available": False,
            "connected": False,
            "transport_enabled": False,
            "source": "unavailable",
            "read_only": True,
        }


def status_from_runtime(data):
    """Normalize live Messenger /status without exposing internal errors."""
    if not isinstance(data, dict):
        return {"available": False, "connected": False,
                "transport_enabled": False, "read_only": True,
                "source": "unavailable"}
    return {
        "available": True,
        "connected": data.get("online") is True,
        "transport_enabled": data.get("transport_enabled") is True,
        "identity": str(data.get("identity") or "")[:128],
        "node_name": str(data.get("node_name") or "")[:64],
        "read_only": True,
        "source": "messenger_runtime",
    }

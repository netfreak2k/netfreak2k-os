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

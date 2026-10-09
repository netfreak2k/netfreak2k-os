"""Compose a truthful Reticulum activation overview for the OS UI.

This module is read-only: it never authorizes or invokes host control.
"""
from reticulum_activation import plan_activation
from reticulum_status import public_status


def activation_overview(rows, runtime_raw, *, username, now=None):
    if not isinstance(username, str) or not username:
        raise ValueError("invalid_username")
    plan = plan_activation(rows, controller_authorized=False)
    runtime = public_status(runtime_raw, now=now)
    prefs = {}
    for owner, key, value in rows:
        if owner == username and key in ("reticulum_requested_enabled", "reticulum_requested_transport"):
            prefs[key] = value == "true"
    requested = prefs.get("reticulum_requested_enabled", False)
    requested_transport = prefs.get("reticulum_requested_transport", False)
    if runtime["state"] == "runtime_status_unavailable":
        phase = "status_unknown"
    elif runtime["state"] == "error":
        phase = "runtime_error"
    elif requested_transport:
        phase = "transport_review_required"
    elif requested and runtime["available"]:
        phase = "local_runtime_active"
    elif requested:
        phase = "activation_pending"
    elif runtime["available"]:
        phase = "active_for_other_users_or_external"
    else:
        phase = "inactive"
    return {
        "phase": phase,
        "requested_enabled": requested,
        "requested_transport": requested_transport,
        "runtime": runtime,
        "active_users": plan.active_users,
        "transport_requests": plan.transport_requests,
        "activation_applied_by_os": False,
        "controller_connected": False,
        "remote_peer_verified": False,
    }

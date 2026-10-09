"""Read-only multi-user Reticulum activation plan.

Never grants container or host control to the web API. A privileged controller
must separately authenticate and re-evaluate this plan before applying it.
"""
from dataclasses import dataclass

@dataclass(frozen=True)
class ActivationPlan:
    action: str
    reason: str
    active_users: int
    transport_requests: int

def plan_activation(rows, *, legacy_transport_detected=False, controller_authorized=False):
    """rows: (username, pref_key, pref_value), loaded from trusted database."""
    if type(legacy_transport_detected) is not bool or type(controller_authorized) is not bool:
        return ActivationPlan("hold", "invalid_controller_input", 0, 0)
    users = {}
    for username, key, value in rows:
        if not isinstance(username, str) or key not in (
            "reticulum_requested_enabled", "reticulum_requested_transport"
        ) or value not in ("true", "false"):
            return ActivationPlan("hold", "invalid_preference_data", 0, 0)
        users.setdefault(username, {})[key] = value == "true"
    active = sum(p.get("reticulum_requested_enabled", False) for p in users.values())
    transport = sum(p.get("reticulum_requested_transport", False) for p in users.values())
    if transport > active or any(
        p.get("reticulum_requested_transport", False)
        and not p.get("reticulum_requested_enabled", False)
        for p in users.values()
    ):
        return ActivationPlan("hold", "transport_requires_enabled_runtime", active, transport)
    if not controller_authorized:
        return ActivationPlan("hold", "controller_not_authorized", active, transport)
    if legacy_transport_detected:
        return ActivationPlan("hold", "legacy_transport_requires_migration", active, transport)
    if transport:
        return ActivationPlan("hold", "transport_controller_not_verified", active, transport)
    if active:
        return ActivationPlan("start_client", "active_user_request", active, transport)
    return ActivationPlan("stop", "no_active_user_requests", active, transport)

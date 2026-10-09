"""Safe activation reconciliation policy.

No Docker socket or host command access. This pure function is intended for a
future privileged controller that can verify user sessions and apply changes.
"""
from dataclasses import dataclass

@dataclass(frozen=True)
class Decision:
    action: str
    reason: str

def reconcile(*, requested_enabled: bool, requested_transport: bool,
              active_users: int, legacy_transport_detected: bool,
              controller_authorized: bool) -> Decision:
    if not controller_authorized:
        return Decision("hold", "controller_not_authorized")
    if legacy_transport_detected:
        return Decision("hold", "legacy_transport_requires_migration")
    if requested_transport:
        return Decision("hold", "transport_not_implemented")
    if not requested_enabled:
        if active_users > 0:
            return Decision("hold", "other_users_active")
        return Decision("stop", "no_active_user_requests")
    return Decision("start_client", "explicit_user_request")

# This module deliberately does not perform start/stop actions.

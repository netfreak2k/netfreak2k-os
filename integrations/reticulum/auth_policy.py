"""Fail-closed authorization rules for future Reticulum OS API integration.

The caller MUST obtain its session from the existing OS authentication stack.
Never trust user IDs, roles or 'authenticated' flags from browser-supplied headers.
"""
from dataclasses import dataclass
from typing import FrozenSet


@dataclass(frozen=True)
class Session:
    user_id: str
    authenticated: bool
    roles: FrozenSet[str]
    csrf_verified: bool = False


class AccessDenied(PermissionError):
    pass


def authorize_reticulum(session: Session | None, *, mutation: bool = False) -> str:
    """Return authenticated principal or raise; guests are never permitted."""
    if session is None or not session.authenticated or not session.user_id:
        raise AccessDenied("Authentication required")
    if "guest" in session.roles:
        raise AccessDenied("Guest access forbidden")
    if mutation and not session.csrf_verified:
        raise AccessDenied("CSRF verification required")
    return session.user_id


def authorize_transport_change(session: Session | None, *, explicit_consent: bool) -> str:
    user_id = authorize_reticulum(session, mutation=True)
    if not explicit_consent:
        raise AccessDenied("Explicit transport consent required")
    return user_id

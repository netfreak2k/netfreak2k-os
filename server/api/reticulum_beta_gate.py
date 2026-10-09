"""Explicit beta feature gate: the OS must not pretend host control is installed.

Only an operator-installed host agent may opt in to the protocol later.
"""
import os

BETA_FLAG = "N2K_RETICULUM_BETA_CONTROL"


def beta_control_state(env=None):
    env = os.environ if env is None else env
    raw = env.get(BETA_FLAG, "")
    enabled = raw == "enabled"
    return {
        "beta_control_requested": enabled,
        "host_controller_connected": False,
        "activation_supported": False,
        "reason": "host_agent_integration_not_installed" if enabled else "beta_control_disabled",
    }

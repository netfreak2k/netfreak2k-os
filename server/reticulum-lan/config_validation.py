"""Side-effect-free validation for persisted Reticulum configuration."""

import re


def _values(text):
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", ";")) or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip().lower()] = value.strip().lower()
    return values


def validate_config(text, requested_transport):
    """Return (valid, reason); never rewrite a persisted configuration."""
    if type(requested_transport) is not bool or not isinstance(text, str):
        return False, "invalid_input"
    sections = re.split(r"(?m)^\s*\[\[([^\n\]]+)\]\]\s*$", text)
    top = sections[0]
    reticulum = re.search(r"(?ms)^\s*\[reticulum\]\s*$([\s\S]*?)(?=^\s*\[[^\[]|\Z)", top)
    if reticulum is None:
        return False, "missing_reticulum_section"
    settings = _values(reticulum.group(1))
    mode = settings.get("enable_transport")
    if mode not in ("yes", "no", "true", "false", "1", "0"):
        return False, "unknown_transport_mode"
    if (mode in ("yes", "true", "1")) != requested_transport:
        return False, "transport_mode_mismatch"
    for index in range(1, len(sections), 2):
        values = _values(sections[index + 1])
        if (values.get("type") == "tcpserverinterface"
                and values.get("enabled") in ("yes", "true", "1")
                and values.get("listen_port") == "4243"
                and values.get("listen_ip") in ("0.0.0.0", "::", None)):
            return True, "ok"
    return False, "missing_messenger_listener"

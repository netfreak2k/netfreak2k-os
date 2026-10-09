"""Strict, side-effect-free validation of persisted Reticulum LAN configuration.

Fail closed on ambiguous duplicate keys, duplicate listeners and unsafe binds.
Never modify a persisted identity or configuration.
"""
import re


def _parse_pairs(lines):
    result = {}
    for line in lines:
        line = line.strip()
        if not line or line.startswith(("#", ";")):
            continue
        if "=" not in line:
            raise ValueError("malformed_setting")
        key, value = line.split("=", 1)
        key = key.strip().lower()
        value = value.strip().lower()
        if not key or not value or key in result:
            raise ValueError("duplicate_or_empty_setting")
        result[key] = value
    return result


def validate_config(text, requested_transport):
    """Return (valid, reason) without touching the filesystem."""
    if type(requested_transport) is not bool or not isinstance(text, str):
        return False, "invalid_input"
    if len(text) > 128 * 1024:
        return False, "config_too_large"

    section = None
    section_name = None
    sections = []
    seen_interfaces = set()
    reticulum_settings = None
    lines = []
    try:
        def flush():
            nonlocal reticulum_settings
            if section == "reticulum":
                if reticulum_settings is not None:
                    raise ValueError("duplicate_reticulum_section")
                reticulum_settings = _parse_pairs(lines)
            elif section == "interface":
                sections.append(_parse_pairs(lines))

        for raw in text.splitlines():
            stripped = raw.strip()
            if not stripped or stripped.startswith(("#", ";")):
                continue
            match = re.fullmatch(r"\[\[([^\[\]]+)\]\]", stripped)
            if match:
                if section != "interface" and section != "interfaces":
                    raise ValueError("interface_outside_interfaces")
                flush()
                section = "interface"
                section_name = match.group(1).strip().lower()
                if not section_name or section_name in seen_interfaces:
                    raise ValueError("duplicate_interface")
                seen_interfaces.add(section_name)
                lines = []
                continue
            match = re.fullmatch(r"\[([^\[\]]+)\]", stripped)
            if match:
                flush()
                section = match.group(1).strip().lower()
                lines = []
                continue
            if section is None:
                raise ValueError("setting_outside_section")
            lines.append(raw)
        flush()
    except ValueError as exc:
        return False, str(exc)

    if reticulum_settings is None:
        return False, "missing_reticulum_section"
    mode = reticulum_settings.get("enable_transport")
    if mode not in ("yes", "no", "true", "false", "1", "0"):
        return False, "unknown_transport_mode"
    if (mode in ("yes", "true", "1")) != requested_transport:
        return False, "transport_mode_mismatch"

    listeners = [
        values for values in sections
        if values.get("type") == "tcpserverinterface"
        and values.get("enabled") in ("yes", "true", "1")
        and values.get("listen_port") == "4243"
        and values.get("listen_ip", "0.0.0.0") in ("0.0.0.0", "::")
    ]
    if len(listeners) != 1:
        return False, "missing_or_ambiguous_messenger_listener"
    return True, "ok"

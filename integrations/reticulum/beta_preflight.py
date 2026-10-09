#!/usr/bin/env python3
"""Read-only host preflight for a Reticulum beta upgrade.

No service changes. Exit 0 only when host conditions can be inspected safely.
An existing runtime always requires a separately verified backup and operator
approval before applying an upgrade.
"""
import argparse
import json
import subprocess
from pathlib import Path

SERVICE = "netfreak2k-reticulum-lan"
VOLUMES = ("netfreak2k-reticulum-lan-data", "netfreak2k-messenger-data")


def inspect_host(run=subprocess.run):
    checks = {}
    for volume in VOLUMES:
        result = run(["docker", "volume", "inspect", volume],
                     capture_output=True, text=True, timeout=15, check=False)
        if result.returncode == 0:
            try:
                rows = json.loads(result.stdout)
                if len(rows) != 1 or rows[0].get("Name") != volume:
                    raise ValueError("unexpected_volume")
                checks[volume] = "existing"
            except (ValueError, TypeError, KeyError):
                checks[volume] = "unverified"
        elif "No such volume" in result.stderr:
            checks[volume] = "absent"
        else:
            checks[volume] = "unverified"
    result = run(["docker", "container", "inspect", SERVICE],
                 capture_output=True, text=True, timeout=15, check=False)
    if result.returncode == 0:
        try:
            rows = json.loads(result.stdout)
            if len(rows) != 1 or rows[0].get("Name", "").lstrip("/") != SERVICE:
                raise ValueError("unexpected_container")
            labels = rows[0].get("Config", {}).get("Labels") or {}
            project = labels.get("com.docker.compose.project")
            service = labels.get("com.docker.compose.service")
            checks["runtime"] = ("managed" if project == "netfreak2k"
                                  and service == SERVICE else "external_or_unverified")
        except (ValueError, TypeError, AttributeError):
            checks["runtime"] = "unverified"
    elif "No such object" in result.stderr or "No such container" in result.stderr:
        checks["runtime"] = "absent"
    else:
        checks["runtime"] = "unverified"
    return checks


def assess(checks, *, backup_verified=False):
    if any(value == "unverified" for value in checks.values()) or checks.get("runtime") == "external_or_unverified":
        return "hold", "unverified_or_external_runtime"
    existing = any(checks.get(name) == "existing" for name in VOLUMES)
    if existing and not backup_verified:
        return "hold", "existing_data_requires_verified_backup"
    if checks.get("runtime") == "managed" and not backup_verified:
        return "hold", "existing_runtime_requires_verified_backup"
    return "review_required", "operator_must_confirm_identity_and_legacy_transport"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-verification-file", type=Path,
                        help="Path to operator-produced verification record; never treated as deployment authorization")
    args = parser.parse_args()
    checks = inspect_host()
    backup_verified = False
    if args.backup_verification_file:
        try:
            record = json.loads(args.backup_verification_file.read_text(encoding="utf-8"))
            backup_verified = (record.get("verified") is True
                               and record.get("reticulum_identity_verified") is True
                               and record.get("messenger_data_verified") is True)
        except (OSError, ValueError, AttributeError):
            pass
    decision, reason = assess(checks, backup_verified=backup_verified)
    print(json.dumps({"checks": checks, "decision": decision, "reason": reason,
                      "apply_permitted": False}, sort_keys=True))
    return 0 if decision == "review_required" else 2


if __name__ == "__main__":
    raise SystemExit(main())

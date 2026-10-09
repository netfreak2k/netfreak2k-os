#!/usr/bin/env python3
"""Explicitly invoked host-side Reticulum controller (never exposed to the web API).

Install/run only after separate host approval. Defaults to dry-run. Reads the
existing OS preference database; never modifies RNS identity or configuration.
"""
import argparse
import os
import sqlite3
import subprocess
from pathlib import Path

from activation_policy import reconcile


def read_requests(db_path):
    # Read-only SQLite URI; missing database must not be created.
    path = Path(db_path).resolve(strict=True)
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    try:
        rows = conn.execute(
            "SELECT username,pref_key,pref_value FROM user_preferences "
            "WHERE pref_key IN ('reticulum_requested_enabled','reticulum_requested_transport')"
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        raise ValueError("no_reticulum_preferences_configured")
    users = {}
    for username, key, value in rows:
        if not isinstance(username, str) or not username or value not in ("true", "false"):
            raise ValueError("invalid_preference_data")
        prefs = users.setdefault(username, {})
        prefs[key] = value == "true"
    if any("reticulum_requested_enabled" not in p for p in users.values()):
        raise ValueError("missing_enabled_preference")
    if any(p.get("reticulum_requested_transport", False)
           and not p.get("reticulum_requested_enabled", False) for p in users.values()):
        raise ValueError("inconsistent_transport_request")
    return (sum(p.get("reticulum_requested_enabled", False) for p in users.values()),
            any(p.get("reticulum_requested_transport", False) for p in users.values()))


def decide(db_path, *, legacy_transport_detected=False):
    users, transport = read_requests(db_path)
    return reconcile(
        requested_enabled=users > 0, requested_transport=transport,
        active_users=users, legacy_transport_detected=legacy_transport_detected,
        controller_authorized=True,
    )


def compose_command(compose_file, action):
    if action == "start_client":
        # Never turn on RNS transport automatically.
        return ["docker", "compose", "-f", str(compose_file), "up", "-d",
                "--no-deps", "--no-build", "--force-recreate", "netfreak2k-reticulum-lan"]
    if action == "stop":
        return ["docker", "compose", "-f", str(compose_file), "stop",
                "netfreak2k-reticulum-lan"]
    raise ValueError("unsupported_action")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    parser.add_argument("--compose-file", required=True)
    parser.add_argument("--apply", action="store_true", help="Explicit host-side authorization")
    parser.add_argument("--confirm-service", default="", help="Must equal netfreak2k-reticulum-lan when applying")
    parser.add_argument("--legacy-transport-detected", action="store_true")
    parser.add_argument("--legacy-checked", action="store_true", help="Host operator confirms legacy transport was checked")
    parser.add_argument("--existing-runtime-reviewed", action="store_true", help="Operator verified existing container state and identity")
    args = parser.parse_args()
    if not args.existing_runtime_reviewed:
        print("HOLD: existing runtime and identity must be reviewed")
        return 2
    if not args.legacy_checked:
        print("HOLD: legacy transport inventory must be checked before proceeding")
        return 2
    try:
        decision = decide(args.database, legacy_transport_detected=args.legacy_transport_detected)
    except (OSError, sqlite3.Error, ValueError) as exc:
        print(f"HOLD: preferences unavailable or invalid: {type(exc).__name__}")
        return 2
    print(f"decision={decision.action} reason={decision.reason}")
    if decision.action == "hold":
        return 2
    if not args.apply:
        print("DRY RUN: no services changed")
        return 0
    if args.confirm_service != "netfreak2k-reticulum-lan":
        print("Refusing apply without exact service confirmation")
        return 2
    if os.geteuid() != 0:
        print("Refusing apply without host administrator privileges")
        return 2
    compose_file = Path(args.compose_file).resolve(strict=True)
    if not compose_file.is_file():
        return 2
    command = compose_command(compose_file, decision.action)
    # Do not allow the host environment to silently select another project.
    project = "netfreak2k"
    command[2:2] = ["--project-name", project]
    if decision.action == "start_client":
        # The env flag controls the opt-in runtime. Compose defaults to disabled.
        env = dict(os.environ)
        env["N2K_RETICULUM_ENABLED"] = "true"
        env["N2K_RETICULUM_TRANSPORT"] = "false"
    else:
        env = dict(os.environ)
    env.pop("COMPOSE_FILE", None)
    env.pop("COMPOSE_PROJECT_NAME", None)
    env.pop("COMPOSE_PROFILES", None)
    # Compose must resolve relative env_file and project resources from its own directory.
    subprocess.run(command, check=True, env=env, timeout=120, cwd=str(compose_file.parent))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

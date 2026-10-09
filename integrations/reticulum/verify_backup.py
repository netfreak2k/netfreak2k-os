#!/usr/bin/env python3
"""Read-only verification of Reticulum beta backup archives.

A backup receipt is valid only if both named-volume archives exist, have
nonzero size, and match the SHA-256 hashes recorded by the operator.
This never authorizes deployment or changes the live installation.
"""
import argparse
import hashlib
import json
from pathlib import Path

REQUIRED = ("reticulum", "messenger")


def verify_receipt(receipt_path: Path):
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt.get("schema") != 1:
            raise ValueError("unsupported receipt schema")
        artifacts = receipt["artifacts"]
        if set(artifacts) != set(REQUIRED):
            raise ValueError("both reticulum and messenger archives required")
        result = {}
        for name in REQUIRED:
            entry = artifacts[name]
            filename = entry["filename"]
            expected = entry["sha256"]
            if (not isinstance(filename, str) or
                    Path(filename).name != filename or
                    not filename.endswith(".tar.gz")):
                raise ValueError("invalid archive filename")
            if (not isinstance(expected, str) or len(expected) != 64 or
                    any(ch not in "0123456789abcdef" for ch in expected)):
                raise ValueError("invalid sha256")
            archive = receipt_path.parent / filename
            if not archive.is_file() or archive.stat().st_size == 0:
                raise ValueError("missing or empty archive: " + name)
            digest = hashlib.sha256()
            with archive.open("rb") as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(block)
            if digest.hexdigest() != expected:
                raise ValueError("checksum mismatch: " + name)
            result[name] = {"filename": filename, "bytes": archive.stat().st_size}
        return {"ok": True, "archives": result, "restore_tested": False,
                "install_permitted": False}
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return {"ok": False, "reason": str(exc), "install_permitted": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()
    result = verify_receipt(args.receipt)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Offline Reticulum beta archive creation from an operator-supplied snapshot.

This tool never reads live Docker volumes or alters a running service.
The caller must first create a consistent, stopped-service snapshot.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tarfile
import tempfile

REQUIRED = ("reticulum", "messenger")


def create_archives(snapshot_root: Path, output_dir: Path):
    snapshot_root = snapshot_root.resolve(strict=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_dir = output_dir.resolve(strict=True)
    if output_dir == snapshot_root or snapshot_root in output_dir.parents:
        raise ValueError("output must be outside snapshot tree")
    if any(output_dir == (snapshot_root / name) for name in REQUIRED):
        raise ValueError("output overlaps source")
    artifacts = {}
    for name in REQUIRED:
        source = snapshot_root / name
        if not source.is_dir() or source.is_symlink():
            raise ValueError("missing or symlinked snapshot: " + name)
        files = list(source.rglob("*"))
        if not files or not any(p.is_file() for p in files):
            raise ValueError("empty snapshot: " + name)
        if any(p.is_symlink() or not (p.is_file() or p.is_dir()) for p in files):
            raise ValueError("symlinks or special files in snapshot: " + name)
    for name in REQUIRED:
        filename = name + ".tar.gz"
        destination = output_dir / filename
        fd, temp = tempfile.mkstemp(prefix=".n2k-backup-", dir=output_dir)
        os.close(fd)
        try:
            with tarfile.open(temp, "w:gz", dereference=False) as tar:
                tar.add(snapshot_root / name, arcname=name, recursive=True)
            digest = hashlib.sha256()
            with open(temp, "rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            os.replace(temp, destination)
            artifacts[name] = {"filename": filename, "sha256": digest.hexdigest()}
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
    receipt = {"schema": 1, "artifacts": artifacts,
               "source": "operator_supplied_offline_snapshot",
               "restore_tested": False, "install_permitted": False}
    fd, temp = tempfile.mkstemp(prefix=".n2k-receipt-", dir=output_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(receipt, stream, indent=2)
            stream.write("\n")
        os.replace(temp, output_dir / "receipt.json")
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot_root", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    print(json.dumps(create_archives(args.snapshot_root, args.output_dir)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

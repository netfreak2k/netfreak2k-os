#!/usr/bin/env python3
"""Safely test extracting Reticulum backup archives into an isolated directory.

Never writes to Docker volumes. Refuses traversal, links and special files.
"""
import argparse
import json
from pathlib import Path
import tarfile
import tempfile

from verify_backup import verify_receipt

REQUIRED = ("reticulum", "messenger")


def test_restore(receipt_path: Path):
    verification = verify_receipt(receipt_path)
    if not verification["ok"]:
        return {"ok": False, "reason": "backup_verification_failed",
                "install_permitted": False}
    try:
        with tempfile.TemporaryDirectory(prefix="n2k-reticulum-restore-") as tmp:
            target = Path(tmp)
            for name in REQUIRED:
                archive = receipt_path.parent / verification["archives"][name]["filename"]
                with tarfile.open(archive, "r:gz") as tar:
                    members = tar.getmembers()
                    if not members:
                        raise ValueError("empty_archive")
                    for member in members:
                        path = Path(member.name)
                        if (path.is_absolute() or ".." in path.parts or
                                not path.parts or path.parts[0] != name or
                                not (member.isfile() or member.isdir())):
                            raise ValueError("unsafe_archive_member")
                    for member in members:
                        destination = target.joinpath(*Path(member.name).parts)
                        if member.isdir():
                            destination.mkdir(parents=True, exist_ok=True)
                        else:
                            destination.parent.mkdir(parents=True, exist_ok=True)
                            source = tar.extractfile(member)
                            if source is None:
                                raise ValueError("missing_archive_content")
                            with source, destination.open("xb") as out:
                                while chunk := source.read(1024 * 1024):
                                    out.write(chunk)
                if not any(p.is_file() for p in (target / name).rglob("*")):
                    raise ValueError("no_restored_files")
        return {"ok": True, "restore_tested": True,
                "scope": "isolated_archive_extraction_only",
                "live_volume_restore_tested": False, "install_permitted": False}
    except (OSError, ValueError, tarfile.TarError) as exc:
        return {"ok": False, "reason": str(exc), "install_permitted": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("receipt", type=Path)
    result = test_restore(parser.parse_args().receipt)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_backup import verify_receipt


class BackupReceiptTests(unittest.TestCase):
    def test_both_archives_with_matching_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = {}
            for name in ("reticulum", "messenger"):
                filename = name + ".tar.gz"
                payload = (name + "-snapshot").encode()
                (root / filename).write_bytes(payload)
                artifacts[name] = {"filename": filename,
                                   "sha256": hashlib.sha256(payload).hexdigest()}
            receipt = root / "receipt.json"
            receipt.write_text(json.dumps({"schema": 1, "artifacts": artifacts}))
            result = verify_receipt(receipt)
            self.assertTrue(result["ok"])
            self.assertFalse(result["install_permitted"])
            self.assertFalse(result["restore_tested"])

            (root / "messenger.tar.gz").write_bytes(b"tampered")
            self.assertFalse(verify_receipt(receipt)["ok"])

    def test_missing_receipt_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertFalse(verify_receipt(Path(directory) / "missing.json")["ok"])

    def test_path_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = root / "receipt.json"
            receipt.write_text(json.dumps({"schema": 1, "artifacts": {
                "reticulum": {"filename": "../private.tar.gz", "sha256": "0" * 64},
                "messenger": {"filename": "messenger.tar.gz", "sha256": "0" * 64},
            }}))
            self.assertFalse(verify_receipt(receipt)["ok"])


if __name__ == "__main__":
    unittest.main()

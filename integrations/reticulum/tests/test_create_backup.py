import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from create_backup import create_archives
from verify_backup import verify_receipt


class CreateBackupTests(unittest.TestCase):
    def test_roundtrip_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / "snapshot"
            for name in ("reticulum", "messenger"):
                (snapshot / name).mkdir(parents=True)
                (snapshot / name / "data.bin").write_bytes(name.encode())
            output = root / "backup"
            receipt = create_archives(snapshot, output)
            self.assertFalse(receipt["install_permitted"])
            self.assertTrue(verify_receipt(output / "receipt.json")["ok"])
            self.assertFalse(verify_receipt(output / "receipt.json")["restore_tested"])

    def test_missing_snapshot_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "snapshot" / "reticulum").mkdir(parents=True)
            (root / "snapshot" / "reticulum" / "data").write_bytes(b"x")
            with self.assertRaises(ValueError):
                create_archives(root / "snapshot", root / "backup")

    def test_nested_output_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("reticulum", "messenger"):
                (root / "snapshot" / name).mkdir(parents=True)
                (root / "snapshot" / name / "data").write_bytes(b"x")
            with self.assertRaises(ValueError):
                create_archives(root / "snapshot", root / "snapshot" / "backup")


if __name__ == "__main__":
    unittest.main()

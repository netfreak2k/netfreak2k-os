import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
import sys
import hashlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from create_backup import create_archives
from test_restore import test_restore


class RestoreRehearsalTests(unittest.TestCase):
    def test_isolated_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("reticulum", "messenger"):
                source = root / "snap" / name
                source.mkdir(parents=True)
                (source / "state").write_bytes(name.encode())
            create_archives(root / "snap", root / "out")
            result = test_restore(root / "out" / "receipt.json")
            self.assertTrue(result["ok"])
            self.assertTrue(result["restore_tested"])
            self.assertFalse(result["live_volume_restore_tested"])
            self.assertFalse(result["install_permitted"])

    def test_traversal_archive_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = {}
            for name in ("reticulum", "messenger"):
                path = root / (name + ".tar.gz")
                with tarfile.open(path, "w:gz") as tar:
                    info = tarfile.TarInfo("../escape" if name == "reticulum" else name + "/state")
                    payload = b"test"
                    info.size = len(payload)
                    tar.addfile(info, io.BytesIO(payload))
                artifacts[name] = {"filename": path.name,
                                   "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            receipt = root / "receipt.json"
            receipt.write_text(json.dumps({"schema": 1, "artifacts": artifacts}))
            self.assertFalse(test_restore(receipt)["ok"])


if __name__ == "__main__":
    unittest.main()

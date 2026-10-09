import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "api"))
from reticulum_clean import status_from_file, status_from_runtime


class ReticulumCleanTests(unittest.TestCase):
    def test_live_runtime_normalization(self):
        result = status_from_runtime({"online": True, "transport_enabled": False,
                                      "identity": "abcd", "node_name": "N2K"})
        self.assertTrue(result["available"])
        self.assertTrue(result["connected"])
        self.assertFalse(result["transport_enabled"])
        self.assertEqual(result["identity"], "abcd")
        self.assertTrue(result["read_only"])

    def test_live_runtime_unavailable(self):
        result = status_from_runtime(None)
        self.assertFalse(result["available"])
        self.assertFalse(result["connected"])

    def test_missing_status_is_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            result = status_from_file(Path(directory) / "missing.json")
            self.assertFalse(result["available"])
            self.assertTrue(result["read_only"])

    def test_existing_status_is_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            data = '{"connected":true,"transport_enabled":false}'
            path.write_text(data)
            result = status_from_file(path)
            self.assertTrue(result["connected"])
            self.assertFalse(result["transport_enabled"])
            self.assertEqual(path.read_text(), data)

    def test_invalid_status_is_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            path.write_text("broken")
            self.assertFalse(status_from_file(path)["available"])


if __name__ == "__main__":
    unittest.main()

import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "server" / "api"))
from reticulum_status import public_status

class RuntimeStatusTests(unittest.TestCase):
    def test_missing(self):
        self.assertFalse(public_status(None)["available"])
    def test_stale(self):
        self.assertEqual(public_status({"state":"local_instance_started","enabled":True,"available":True,"updated_at":1},now=100)["state"],"runtime_status_unavailable")
    def test_local_does_not_prove_remote(self):
        status=public_status({"state":"local_instance_started","enabled":True,"available":True,"connected":True,"transport_enabled":True,"updated_at":100},now=100)
        self.assertTrue(status["available"])
        self.assertIsNone(status["connected"])
        self.assertFalse(status["transport_enabled"])
    def test_invalid_state(self):
        self.assertFalse(public_status({"state":"hacked","updated_at":100},now=100)["available"])
    def test_disabled(self):
        self.assertFalse(public_status({"state":"disabled","enabled":False,"available":False,"updated_at":100},now=100)["available"])
    def test_future_timestamp(self):
        self.assertFalse(public_status({"state":"local_instance_started","enabled":True,"available":True,"updated_at":101},now=100)["available"])
if __name__=="__main__":
    unittest.main()

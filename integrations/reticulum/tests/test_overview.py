import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "server/api"))
from reticulum_overview import activation_overview

NOW = 1800000000
ROWS = [("alice", "reticulum_requested_enabled", "true"),
        ("alice", "reticulum_requested_transport", "false"),
        ("bob", "reticulum_requested_enabled", "false")]
LIVE = {"state": "local_instance_started", "enabled": True, "available": True,
        "transport_enabled": False, "updated_at": NOW}
OFF = {"state": "disabled", "enabled": False, "available": False,
       "transport_enabled": False, "updated_at": NOW}


class OverviewTests(unittest.TestCase):
    def test_requested_but_not_running(self):
        result = activation_overview(ROWS, OFF, username="alice", now=NOW)
        self.assertEqual(result["phase"], "activation_pending")
        self.assertFalse(result["activation_applied_by_os"])
        self.assertEqual(result["active_users"], 1)

    def test_running_does_not_claim_remote_peer(self):
        result = activation_overview(ROWS, LIVE, username="alice", now=NOW)
        self.assertEqual(result["phase"], "local_runtime_active")
        self.assertIsNone(result["runtime"]["connected"])
        self.assertFalse(result["remote_peer_verified"])

    def test_other_user_cannot_claim_activation(self):
        result = activation_overview(ROWS, LIVE, username="bob", now=NOW)
        self.assertEqual(result["phase"], "active_for_other_users_or_external")
        self.assertFalse(result["requested_enabled"])

    def test_stale_status_is_unknown(self):
        result = activation_overview(ROWS, LIVE, username="alice", now=NOW+100)
        self.assertEqual(result["phase"], "status_unknown")

    def test_transport_request_requires_review(self):
        rows = [("alice", "reticulum_requested_enabled", "true"),
                ("alice", "reticulum_requested_transport", "true")]
        result = activation_overview(rows, OFF, username="alice", now=NOW)
        self.assertEqual(result["phase"], "transport_review_required")

    def test_invalid_user(self):
        with self.assertRaises(ValueError):
            activation_overview(ROWS, LIVE, username="", now=NOW)


if __name__ == "__main__":
    unittest.main()

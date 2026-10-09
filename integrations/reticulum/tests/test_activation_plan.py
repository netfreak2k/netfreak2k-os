import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "server/api"))
from reticulum_activation import plan_activation

def row(user, enabled=False, transport=False):
    return [(user, "reticulum_requested_enabled", str(enabled).lower()),
            (user, "reticulum_requested_transport", str(transport).lower())]

class ActivationPlanTests(unittest.TestCase):
    def test_web_preview_never_authorizes(self):
        p = plan_activation(row("a", True))
        self.assertEqual(p.action, "hold")
        self.assertEqual(p.active_users, 1)
    def test_multiple_users_keep_client_running(self):
        p = plan_activation(row("a", True) + row("b", False), controller_authorized=True)
        self.assertEqual((p.action, p.active_users), ("start_client", 1))
    def test_no_active_users_stop(self):
        p = plan_activation(row("a"), controller_authorized=True)
        self.assertEqual(p.action, "stop")
    def test_transport_requires_separate_verification(self):
        p = plan_activation(row("a", True, True), controller_authorized=True)
        self.assertEqual(p.reason, "transport_controller_not_verified")
    def test_legacy_transport_blocks_changes(self):
        p = plan_activation(row("a", True), legacy_transport_detected=True, controller_authorized=True)
        self.assertEqual(p.action, "hold")
    def test_inconsistent_user_preferences_block_changes(self):
        p = plan_activation(row("a", False, True), controller_authorized=True)
        self.assertEqual(p.reason, "transport_requires_enabled_runtime")
    def test_malformed_preferences_fail_closed(self):
        p = plan_activation([("a", "reticulum_requested_enabled", "YES")], controller_authorized=True)
        self.assertEqual(p.action, "hold")

if __name__ == "__main__":
    unittest.main()

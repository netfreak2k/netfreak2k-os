import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from activation_policy import reconcile

BASE = dict(requested_enabled=True, requested_transport=False, active_users=0,
            legacy_transport_detected=False, controller_authorized=True)

class ActivationPolicyTests(unittest.TestCase):
    def check(self, expected, **changes):
        self.assertEqual(reconcile(**(BASE | changes)).action, expected)

    def test_explicit_client_opt_in(self):
        self.check("start_client")

    def test_disabled(self):
        self.check("stop", requested_enabled=False)

    def test_never_stop_other_active_users(self):
        self.check("hold", requested_enabled=False, active_users=2)

    def test_unauthorized_controller(self):
        self.check("hold", controller_authorized=False)

    def test_legacy_transport(self):
        self.check("hold", legacy_transport_detected=True)

    def test_transport_unimplemented(self):
        self.check("hold", requested_transport=True)

    def test_negative_active_users_rejected(self):
        self.check("hold", active_users=-1)

    def test_string_flag_rejected(self):
        self.check("hold", requested_enabled="false")

    def test_boolean_active_users_rejected(self):
        self.check("hold", active_users=True)

if __name__ == "__main__":
    unittest.main()

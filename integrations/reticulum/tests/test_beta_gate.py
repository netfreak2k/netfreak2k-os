import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "server/api"))
from reticulum_beta_gate import beta_control_state


class BetaGateTests(unittest.TestCase):
    def test_default_is_disabled(self):
        self.assertEqual(beta_control_state({})["reason"], "beta_control_disabled")
    def test_unrecognized_value_is_disabled(self):
        self.assertFalse(beta_control_state({"N2K_RETICULUM_BETA_CONTROL": "true"})["beta_control_requested"])
    def test_opt_in_does_not_claim_controller_installed(self):
        state = beta_control_state({"N2K_RETICULUM_BETA_CONTROL": "enabled"})
        self.assertTrue(state["beta_control_requested"])
        self.assertFalse(state["host_controller_connected"])
        self.assertFalse(state["activation_supported"])


if __name__ == "__main__":
    unittest.main()

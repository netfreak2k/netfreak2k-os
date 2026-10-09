"""Executable regression tests for LAN and transport configuration."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "server/reticulum-lan"))
from config_validation import validate_config

BASE = """[reticulum]
  enable_transport = No
  share_instance = No

[interfaces]
  [[N2K Discovery]]
    type = AutoInterface
    enabled = Yes
  [[N2K LAN Server]]\n    type = TCPServerInterface\n    enabled = Yes\n    listen_port = 4243\n"""

class ConfigValidationTests(unittest.TestCase):
    def test_valid_client(self):
        self.assertEqual(validate_config(BASE, False), (True, "ok"))

    def test_explicit_transport(self):
        self.assertEqual(validate_config(BASE.replace("enable_transport = No", "enable_transport = Yes"), True), (True, "ok"))

    def test_transport_mismatch(self):
        self.assertEqual(validate_config(BASE, True)[1], "transport_mode_mismatch")

    def test_disabled_listener(self):
        self.assertEqual(validate_config(BASE.replace("type = TCPServerInterface\n    enabled = Yes", "type = TCPServerInterface\n    enabled = No"), False)[1], "missing_or_ambiguous_messenger_listener")

    def test_port_in_different_interface(self):
        changed = BASE.replace("listen_port = 4243", "listen_port = 4244")
        changed += "  [[Other Interface]]\n    type = AutoInterface\n    enabled = Yes\n    listen_port = 4243\n"
        self.assertEqual(validate_config(changed, False)[1], "missing_or_ambiguous_messenger_listener")

    def test_missing_mode_is_rejected(self):
        self.assertEqual(validate_config(BASE.replace("enable_transport = No", ""), False)[1], "unknown_transport_mode")

    def test_disabled_transport_is_not_assumed_enabled(self):
        self.assertEqual(validate_config(BASE, False), (True, "ok"))
        self.assertEqual(validate_config(BASE, True)[1], "transport_mode_mismatch")

    def test_wrong_port_is_rejected(self):
        changed = BASE.replace("listen_port = 4243", "listen_port = 4244")
        self.assertEqual(validate_config(changed, False)[1], "missing_or_ambiguous_messenger_listener")

    def test_listener_bound_to_wrong_host_is_rejected(self):
        changed = BASE.replace("listen_port = 4243", "listen_ip = 127.0.0.1\\n    listen_port = 4243")
        self.assertEqual(validate_config(changed, False)[1], "missing_or_ambiguous_messenger_listener")

    def test_duplicate_transport_setting_is_rejected(self):
        changed = BASE.replace("enable_transport = No", "enable_transport = No\n  enable_transport = Yes")
        self.assertEqual(validate_config(changed, False)[1], "duplicate_or_empty_setting")

    def test_duplicate_listener_is_rejected(self):
        changed = BASE + "  [[Second LAN Server]]\n    type = TCPServerInterface\n    enabled = Yes\n    listen_port = 4243\n"
        self.assertEqual(validate_config(changed, False)[1], "missing_or_ambiguous_messenger_listener")

    def test_duplicate_interface_name_is_rejected(self):
        changed = BASE + "  [[N2K LAN Server]]\n    type = TCPServerInterface\n    enabled = Yes\n    listen_port = 4243\n"
        self.assertEqual(validate_config(changed, False)[1], "duplicate_interface")

    def test_invalid_flag_type_is_rejected(self):
        self.assertEqual(validate_config(BASE, "false")[1], "invalid_input")

    def test_comments_do_not_count(self):
        changed = BASE.replace("    listen_port = 4243", "    # listen_port = 4243")
        self.assertEqual(validate_config(changed, False)[1], "missing_or_ambiguous_messenger_listener")

if __name__ == "__main__":
    unittest.main()

"""Unit tests: run with python -m unittest discover -s server/reticulum-lan -p 'test_*.py'."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest

sys.modules.setdefault("RNS", types.ModuleType("RNS"))
spec = importlib.util.spec_from_file_location("shadow_transport", Path(__file__).with_name("service.py"))
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class ShadowSettingsTests(unittest.TestCase):
    def parse(self, data):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "shadow.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            return service.load_settings(path)

    def test_default_opt_in(self):
        self.assertFalse(self.parse({})["enabled"])
        self.assertEqual(self.parse({})["peers"], [])

    def test_reject_tor_peer(self):
        with self.assertRaises(ValueError):
            self.parse({"peers": [{"transport": "tor", "host": "node.onion", "port": 4243}]})

    def test_reject_tor_switch(self):
        with self.assertRaises(ValueError):
            self.parse({"tor_enabled": True})

    def test_reject_bad_port(self):
        with self.assertRaises(ValueError):
            self.parse({"peers": [{"transport": "tcp", "host": "example.org", "port": 70000}]})

    def test_reject_unbounded_peers(self):
        with self.assertRaises(ValueError):
            self.parse({"peers": [{"transport": "tcp", "host": f"host{i}.example", "port": 4243} for i in range(9)]})

    def test_reject_unknown_field(self):
        with self.assertRaises(ValueError):
            self.parse({"public": True})

    def test_disabled_has_no_peer_interfaces(self):
        self.assertNotIn("N2K Shadow Peer", service.managed_config(self.parse({"enabled": False})))

    def test_tcp_peer_interface(self):
        settings = self.parse({"enabled": True, "peers": [
            {"transport": "tcp", "host": "node.example.org", "port": 4243}]})
        self.assertIn("target_host = node.example.org", service.managed_config(settings))



if __name__ == "__main__":
    unittest.main()

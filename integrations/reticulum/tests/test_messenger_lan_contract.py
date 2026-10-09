"""Regression checks for the legacy Messenger-to-Reticulum TCP contract.

These checks are source-level guards; they do not prove live connectivity.
"""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]


class MessengerLanContractTests(unittest.TestCase):
    def test_messenger_uses_legacy_tcp_port(self):
        messenger = (ROOT / "server/messenger/service.py").read_text()
        self.assertIn("TCPClientInterface", messenger)
        self.assertIn("target_port = 4243", messenger)

    def test_lan_runtime_exposes_legacy_tcp_server(self):
        runtime = (ROOT / "server/reticulum-lan/service.py").read_text()
        self.assertIn("TCPServerInterface", runtime)
        self.assertIn("listen_port = 4243", runtime)
        self.assertIn("migration required", runtime)

    def test_messenger_host_routing_preserved(self):
        compose = (ROOT / "server/docker-compose.yml").read_text()
        self.assertIn('N2K_LAN_TRANSPORT_HOST: "host.docker.internal"', compose)
        self.assertIn('"host.docker.internal:host-gateway"', compose)
        self.assertIn("network_mode: host", compose)

    def test_runtime_defaults_to_opt_out(self):
        compose = (ROOT / "server/docker-compose.yml").read_text()
        self.assertIn('N2K_RETICULUM_ENABLED: "${N2K_RETICULUM_ENABLED:-false}"', compose)
        self.assertIn('N2K_RETICULUM_TRANSPORT: "${N2K_RETICULUM_TRANSPORT:-false}"', compose)


if __name__ == "__main__":
    unittest.main()

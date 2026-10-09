"""Guard the existing Messenger-to-LAN Reticulum TCP contract."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]


class LANContractTests(unittest.TestCase):
    def test_messenger_uses_port_4243(self):
        source = (ROOT / "server/messenger/service.py").read_text()
        self.assertIn("target_port = 4243", source)

    def test_lan_server_offers_port_4243(self):
        source = (ROOT / "server/reticulum-lan/service.py").read_text()
        self.assertIn("TCPServerInterface", source)
        self.assertIn("listen_port = 4243", source)

    def test_listener_validation_is_interface_scoped(self):
        source = (ROOT / "server/reticulum-lan/service.py").read_text()
        self.assertIn("listener_valid = any(", source)
        self.assertIn("for section in sections", source)
        self.assertIn("if not listener_valid:", source)

    def test_compose_uses_host_gateway(self):
        source = (ROOT / "server/docker-compose.yml").read_text()
        self.assertIn("N2K_LAN_TRANSPORT_HOST", source)
        self.assertIn("host-gateway", source)


if __name__ == "__main__":
    unittest.main()

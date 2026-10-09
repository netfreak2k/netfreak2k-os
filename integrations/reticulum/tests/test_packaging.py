"""Check that Reticulum modules are shipped in the actual Docker images."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]

class PackagingTests(unittest.TestCase):
    def test_api_includes_activation_planner(self):
        dockerfile = (ROOT / "server/api/Dockerfile").read_text()
        self.assertIn("COPY server/api/reticulum_activation.py /app/reticulum_activation.py", dockerfile)
        self.assertIn("COPY server/api/reticulum_status.py /app/reticulum_status.py", dockerfile)

    def test_lan_runtime_includes_config_validator(self):
        dockerfile = (ROOT / "server/reticulum-lan/Dockerfile").read_text()
        self.assertIn("COPY server/reticulum-lan/config_validation.py /app/config_validation.py", dockerfile)
        self.assertIn("COPY server/reticulum-lan/service.py /app/service.py", dockerfile)

    def test_activation_plan_is_admin_only(self):
        source = (ROOT / "server/api/server.py").read_text()
        start = source.index('if path == "/reticulum/activation-plan":')
        end = source.index('if path == "/reticulum/status":', start)
        route = source[start:end]
        self.assertIn("self.require_auth()", route)
        self.assertIn("self.require_admin(session)", route)
        self.assertIn("controller_authorized=False", route)
        self.assertIn('"applied": False', route)

    def test_api_cannot_access_docker_socket(self):
        compose = (ROOT / "server/docker-compose.yml").read_text()
        start = compose.index("  netfreak2k-api:")
        end = compose.index("  netfreak2k-web:", start)
        self.assertNotIn("docker.sock", compose[start:end])

if __name__ == "__main__":
    unittest.main()

import json
import pathlib
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from beta_preflight import inspect_host, assess


class PreflightTests(unittest.TestCase):
    def test_fresh_host_requires_review(self):
        checks = {"netfreak2k-reticulum-lan-data": "absent",
                  "netfreak2k-messenger-data": "absent", "runtime": "absent"}
        self.assertEqual(assess(checks)[0], "review_required")

    def test_existing_identity_requires_backup(self):
        checks = {"netfreak2k-reticulum-lan-data": "existing",
                  "netfreak2k-messenger-data": "existing", "runtime": "managed"}
        self.assertEqual(assess(checks)[1], "existing_data_requires_verified_backup")
        self.assertEqual(assess(checks, backup_verified=True)[0], "review_required")

    def test_external_runtime_never_approved(self):
        checks = {"netfreak2k-reticulum-lan-data": "absent",
                  "netfreak2k-messenger-data": "absent", "runtime": "external_or_unverified"}
        self.assertEqual(assess(checks, backup_verified=True)[0], "hold")

    def test_unknown_volume_never_approved(self):
        checks = {"netfreak2k-reticulum-lan-data": "unverified",
                  "netfreak2k-messenger-data": "absent", "runtime": "absent"}
        self.assertEqual(assess(checks, backup_verified=True)[0], "hold")

    def test_docker_inspection_read_only(self):
        commands = []
        def fake_run(command, **kwargs):
            commands.append(command)
            if command[1] == "volume":
                return SimpleNamespace(returncode=1, stdout="", stderr="No such volume")
            return SimpleNamespace(returncode=1, stdout="", stderr="No such object")
        checks = inspect_host(run=fake_run)
        self.assertEqual(checks["runtime"], "absent")
        self.assertEqual(checks["netfreak2k-reticulum-lan-data"], "unverified")
        self.assertEqual(len(commands), 1)
        self.assertTrue(all(cmd[:2] in (["docker", "volume"], ["docker", "container"]) for cmd in commands))
        self.assertTrue(all(cmd[2] == "inspect" for cmd in commands))


if __name__ == "__main__":
    unittest.main()

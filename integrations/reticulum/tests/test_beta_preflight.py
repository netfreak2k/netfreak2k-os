import json
import pathlib
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from beta_preflight import inspect_host, assess


class PreflightTests(unittest.TestCase):
    def test_fresh_host_requires_separate_clean_install_review(self):
        checks = {"netfreak2k-reticulum-lan-data": "absent",
                  "netfreak2k-messenger-data": "absent", "runtime": "absent"}
        self.assertEqual(assess(checks)[0], "hold")

    def test_existing_identity_requires_backup(self):
        checks = {"netfreak2k-reticulum-lan-data": "existing",
                  "netfreak2k-messenger-data": "existing", "runtime": "managed", "project": "netfreak2k"}
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

    def test_managed_custom_project_resolves_volume_names(self):
        commands = []
        def fake_run(command, **kwargs):
            commands.append(command)
            if command[1] == "container":
                payload = [{"Name": "/netfreak2k-reticulum-lan",
                            "Config": {"Labels": {
                                "com.docker.compose.project": "custom-n2k",
                                "com.docker.compose.service": "netfreak2k-reticulum-lan"}}}]
                return SimpleNamespace(returncode=0, stdout=json.dumps(payload), stderr="")
            return SimpleNamespace(returncode=1, stdout="", stderr="No such volume")
        checks = inspect_host(run=fake_run)
        self.assertEqual(checks["runtime"], "managed")
        self.assertEqual(checks["project"], "custom-n2k")
        self.assertEqual(checks["netfreak2k-reticulum-lan-data"], "absent")
        self.assertEqual(checks["netfreak2k-messenger-data"], "absent")
        self.assertEqual(commands[1][-1], "custom-n2k_netfreak2k-reticulum-lan-data")
        self.assertEqual(commands[2][-1], "custom-n2k_netfreak2k-messenger-data")

    def test_unknown_container_owner_blocks_all_volumes(self):
        commands = []
        def fake_run(command, **kwargs):
            commands.append(command)
            payload = [{"Name": "/netfreak2k-reticulum-lan",
                        "Config": {"Labels": {"com.docker.compose.project": "foreign"}}}]
            return SimpleNamespace(returncode=0, stdout=json.dumps(payload), stderr="")
        checks = inspect_host(run=fake_run)
        self.assertEqual(checks["runtime"], "external_or_unverified")
        self.assertEqual(checks["netfreak2k-reticulum-lan-data"], "unverified")
        self.assertEqual(assess(checks)[0], "hold")
        self.assertEqual(len(commands), 1)

    def test_missing_docker_is_hold(self):
        def fake_run(command, **kwargs):
            raise FileNotFoundError("docker")
        checks = inspect_host(run=fake_run)
        self.assertEqual(checks["runtime"], "unverified")
        self.assertEqual(assess(checks)[0], "hold")

    def test_docker_timeout_is_hold(self):
        import subprocess
        def fake_run(command, **kwargs):
            raise subprocess.TimeoutExpired(command, 15)
        checks = inspect_host(run=fake_run)
        self.assertEqual(checks["runtime"], "unverified")
        self.assertEqual(assess(checks)[0], "hold")

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

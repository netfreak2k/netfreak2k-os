import pathlib
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from host_controller import read_requests, decide, compose_command


class HostControllerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = pathlib.Path(self.tmp.name) / "n2k.db"
        with sqlite3.connect(self.db) as conn:
            conn.execute("CREATE TABLE user_preferences(username TEXT, pref_key TEXT, pref_value TEXT)")
    def add(self, username, enabled, transport=False):
        with sqlite3.connect(self.db) as conn:
            conn.executemany("INSERT INTO user_preferences VALUES (?,?,?)", [
                (username, "reticulum_requested_enabled", str(enabled).lower()),
                (username, "reticulum_requested_transport", str(transport).lower())])
    def test_missing_database_is_not_created(self):
        with self.assertRaises(FileNotFoundError):
            read_requests(self.db.parent / "missing.db")
    def test_two_users_do_not_stop_each_other(self):
        self.add("a", True)
        self.add("b", False)
        self.assertEqual(decide(self.db).action, "start_client")
    def test_no_active_users_stop(self):
        self.add("a", False)
        self.assertEqual(decide(self.db).action, "stop")
    def test_transport_is_blocked(self):
        self.add("a", True, True)
        self.assertEqual(decide(self.db).action, "hold")
    def test_legacy_conflict_is_blocked(self):
        self.add("a", True)
        self.assertEqual(decide(self.db, legacy_transport_detected=True).action, "hold")
    def test_invalid_preferences_are_rejected(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO user_preferences VALUES ('a','reticulum_requested_enabled','yes')")
        with self.assertRaises(ValueError):
            read_requests(self.db)
    def test_host_controller_requires_explicit_confirmation(self):
        source = (pathlib.Path(__file__).resolve().parents[1] / "host_controller.py").read_text()
        self.assertIn('args.confirm_service != "netfreak2k-reticulum-lan"', source)
        self.assertIn('env.pop("COMPOSE_PROJECT_NAME", None)', source)
        self.assertIn('["--project-name", project]', source)
    def test_commands_are_fixed(self):
        self.assertIn("netfreak2k-reticulum-lan", compose_command("/tmp/compose.yml", "start_client"))
        self.assertEqual(compose_command("/tmp/compose.yml", "stop")[-2:], ["stop", "netfreak2k-reticulum-lan"])
        with self.assertRaises(ValueError):
            compose_command("/tmp/compose.yml", "delete_everything")


if __name__ == "__main__":
    unittest.main()

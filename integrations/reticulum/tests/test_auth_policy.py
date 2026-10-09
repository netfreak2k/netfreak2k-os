"""Authorization tests; run with python3 -m unittest discover -s integrations/reticulum/tests."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from auth_policy import AccessDenied, Session, authorize_reticulum, authorize_transport_change


class AuthPolicyTests(unittest.TestCase):
    def test_no_session(self):
        with self.assertRaises(AccessDenied):
            authorize_reticulum(None)

    def test_guest_is_denied_even_if_authenticated(self):
        with self.assertRaises(AccessDenied):
            authorize_reticulum(Session("guest-1", True, frozenset({"guest"})))

    def test_anonymous_and_missing_user(self):
        for session in (Session("u1", False, frozenset({"user"})),
                        Session("", True, frozenset({"user"}))):
            with self.subTest(session=session), self.assertRaises(AccessDenied):
                authorize_reticulum(session)

    def test_signed_in_user_can_read(self):
        self.assertEqual(authorize_reticulum(Session("u1", True, frozenset({"user"}))), "u1")

    def test_mutations_need_csrf(self):
        with self.assertRaises(AccessDenied):
            authorize_reticulum(Session("u1", True, frozenset({"user"})), mutation=True)

    def test_mutation_with_csrf(self):
        self.assertEqual(authorize_reticulum(Session("u1", True, frozenset({"user"}), True), mutation=True), "u1")

    def test_transport_requires_separate_consent(self):
        user = Session("u1", True, frozenset({"user"}), True)
        with self.assertRaises(AccessDenied):
            authorize_transport_change(user, explicit_consent=False)
        self.assertEqual(authorize_transport_change(user, explicit_consent=True), "u1")


if __name__ == "__main__":
    unittest.main()

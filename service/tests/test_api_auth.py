"""
test_api_auth.py — HTTP-level tests for the /auth blueprint.

All Datastore calls are replaced with unittest.mock.patch so that no real
GCP connection is needed.  The Flask test client is provided by conftest.py.
"""
import json
from unittest.mock import patch, MagicMock

import pytest

from models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(email="alice@example.com", display_name="Alice",
               password="password123", elo=1000) -> User:
    """Return an in-memory User instance with a hashed password."""
    user = User(
        id="user-alice-0000-0000-0000-000000000001",
        email=email,
        display_name=display_name,
        elo=elo,
    )
    user.set_password(password)
    return user


def _post_json(client, url, body):
    return client.post(
        url,
        data=json.dumps(body),
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------

class TestRegister:
    def test_register_success_returns_201_with_tokens(self, client):
        with (
            patch("api.auth.User.get_by_email", return_value=None),
            patch("api.auth.User.put"),
        ):
            resp = _post_json(client, "/auth/register", {
                "email": "newuser@example.com",
                "password": "s3cret!",
                "displayName": "New User",
            })

        assert resp.status_code == 201
        body = resp.get_json()
        assert "accessToken" in body
        assert "refreshToken" in body

    def test_register_missing_email_returns_400(self, client):
        resp = _post_json(client, "/auth/register", {
            "password": "s3cret!",
            "displayName": "No Email",
        })
        assert resp.status_code == 400

    def test_register_missing_password_returns_400(self, client):
        resp = _post_json(client, "/auth/register", {
            "email": "nopass@example.com",
            "displayName": "No Pass",
        })
        assert resp.status_code == 400

    def test_register_missing_display_name_returns_400(self, client):
        resp = _post_json(client, "/auth/register", {
            "email": "noname@example.com",
            "password": "s3cret!",
        })
        assert resp.status_code == 400

    def test_register_empty_body_returns_400(self, client):
        resp = client.post("/auth/register", content_type="application/json")
        assert resp.status_code == 400

    def test_register_duplicate_email_returns_409(self, client):
        existing = _make_user(email="dupe@example.com")
        with patch("api.auth.User.get_by_email", return_value=existing):
            resp = _post_json(client, "/auth/register", {
                "email": "dupe@example.com",
                "password": "s3cret!",
                "displayName": "Duplicate",
            })
        assert resp.status_code == 409
        body = resp.get_json()
        assert "error" in body

    def test_register_email_is_lowercased(self, client):
        """Email should be normalised to lower-case before being stored."""
        captured = {}

        def fake_put(self):
            captured["email"] = self.email

        with (
            patch("api.auth.User.get_by_email", return_value=None),
            patch.object(User, "put", fake_put),
        ):
            _post_json(client, "/auth/register", {
                "email": "UPPER@Example.COM",
                "password": "s3cret!",
                "displayName": "Upper",
            })

        assert captured.get("email") == "upper@example.com"


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------

class TestLogin:
    def test_login_success_returns_200_with_tokens(self, client):
        user = _make_user(email="alice@example.com", password="correct-pw")
        with patch("api.auth.User.get_by_email", return_value=user):
            resp = _post_json(client, "/auth/login", {
                "email": "alice@example.com",
                "password": "correct-pw",
            })

        assert resp.status_code == 200
        body = resp.get_json()
        assert "accessToken" in body
        assert "refreshToken" in body

    def test_login_wrong_password_returns_401(self, client):
        user = _make_user(email="alice@example.com", password="correct-pw")
        with patch("api.auth.User.get_by_email", return_value=user):
            resp = _post_json(client, "/auth/login", {
                "email": "alice@example.com",
                "password": "wrong-pw",
            })
        assert resp.status_code == 401
        assert "error" in resp.get_json()

    def test_login_unknown_email_returns_401(self, client):
        with patch("api.auth.User.get_by_email", return_value=None):
            resp = _post_json(client, "/auth/login", {
                "email": "nobody@example.com",
                "password": "anything",
            })
        assert resp.status_code == 401

    def test_login_empty_body_returns_401(self, client):
        """An empty JSON body should not crash the server; returns 401."""
        with patch("api.auth.User.get_by_email", return_value=None):
            resp = _post_json(client, "/auth/login", {})
        assert resp.status_code == 401

    def test_login_email_is_case_insensitive(self, client):
        """The login handler lower-cases the email before the lookup."""
        user = _make_user(email="alice@example.com", password="correct-pw")
        with patch("api.auth.User.get_by_email", return_value=user) as mock_get:
            _post_json(client, "/auth/login", {
                "email": "ALICE@EXAMPLE.COM",
                "password": "correct-pw",
            })
        mock_get.assert_called_once_with("alice@example.com")


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

class TestMe:
    def test_me_returns_user_data_when_authenticated(self, client, auth_headers, test_user_id):
        user = User(
            id=test_user_id,
            email="alice@example.com",
            display_name="Alice",
            elo=1050,
        )
        with patch("api.auth.User.get", return_value=user):
            resp = client.get("/auth/me", headers=auth_headers)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["id"] == test_user_id
        assert body["email"] == "alice@example.com"
        assert body["displayName"] == "Alice"
        assert body["elo"] == 1050

    def test_me_returns_401_without_token(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_returns_404_when_user_not_found(self, client, auth_headers):
        with patch("api.auth.User.get", return_value=None):
            resp = client.get("/auth/me", headers=auth_headers)
        assert resp.status_code == 404
        assert "error" in resp.get_json()

    def test_me_returns_401_with_invalid_token(self, client):
        headers = {"Authorization": "Bearer this-is-not-a-real-token"}
        resp = client.get("/auth/me", headers=headers)
        assert resp.status_code == 422  # flask-jwt-extended returns 422 for malformed tokens


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------

class TestLogout:
    def test_logout_returns_200_when_authenticated(self, client, auth_headers):
        resp = client.post("/auth/logout", headers=auth_headers)
        assert resp.status_code == 200

    def test_logout_returns_401_without_token(self, client):
        resp = client.post("/auth/logout")
        assert resp.status_code == 401

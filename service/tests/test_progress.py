"""
test_progress.py — GET/PUT /profile/progress round trip, auth and size cap.
"""
import json
from unittest.mock import patch

from models.user import User


def _user():
    return User(id="test-user-00000000-0000-0000-0000-000000000001", email="p@example.com", display_name="P")


class TestProgress:
    def test_requires_auth(self, client):
        assert client.get("/profile/progress").status_code == 401

    def test_get_empty_document(self, client, auth_headers):
        with patch("api.cards.User.get", return_value=_user()):
            resp = client.get("/profile/progress", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["stories"] == {} and body["unlockedCards"] == []

    def test_put_then_get_round_trip(self, client, auth_headers):
        user = _user()
        doc = {"version": 1, "updatedAt": "2026-10-30T00:00:00Z",
               "stories": {"pyramid-builders": {"completed": True, "stage": 3}},
               "unlockedCards": ["imhotep"]}
        with patch("api.cards.User.get", return_value=user), patch("api.cards.User.put") as put:
            resp = client.put("/profile/progress", data=json.dumps(doc), headers=auth_headers)
            assert resp.status_code == 200
            assert put.called
            assert json.loads(user.progress_json) == doc
            resp = client.get("/profile/progress", headers=auth_headers)
        assert resp.get_json() == doc

    def test_rejects_malformed_document(self, client, auth_headers):
        with patch("api.cards.User.get", return_value=_user()):
            resp = client.put("/profile/progress", data=json.dumps({"stories": []}), headers=auth_headers)
        assert resp.status_code == 400

    def test_rejects_oversized_document(self, client, auth_headers):
        doc = {"stories": {f"s{i}": {"completed": True, "stage": 4, "note": "x" * 200} for i in range(400)}, "unlockedCards": []}
        with patch("api.cards.User.get", return_value=_user()):
            resp = client.put("/profile/progress", data=json.dumps(doc), headers=auth_headers)
        assert resp.status_code == 413

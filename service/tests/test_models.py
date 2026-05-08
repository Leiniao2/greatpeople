"""
test_models.py — unit tests for pure-Python model logic.

All tests exercise only methods that do NOT touch the Datastore client:
__init__, set_password, check_password, to_dict.  No network calls are made.
"""
import pytest

from models.user import User
from models.card import CardDefinition
from models.battle import Match, Round


# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------

class TestUserInit:
    def test_default_elo_is_1000(self):
        user = User(email="a@b.com")
        assert user.elo == 1000

    def test_id_is_assigned_when_not_provided(self):
        user = User()
        assert user.id is not None
        assert len(user.id) > 0

    def test_explicit_id_is_preserved(self):
        user = User(id="explicit-id", email="a@b.com")
        assert user.id == "explicit-id"

    def test_oauth_fields_default_to_none(self):
        user = User()
        assert user.oauth_provider is None
        assert user.oauth_id is None
        assert user.password_hash is None


class TestUserPassword:
    def test_set_password_stores_a_hash(self):
        user = User()
        user.set_password("super-secret")
        assert user.password_hash is not None
        assert user.password_hash != "super-secret"

    def test_check_password_returns_true_for_correct_password(self):
        user = User()
        user.set_password("correct-horse-battery-staple")
        assert user.check_password("correct-horse-battery-staple") is True

    def test_check_password_returns_false_for_wrong_password(self):
        user = User()
        user.set_password("correct-horse-battery-staple")
        assert user.check_password("wrong-password") is False

    def test_check_password_returns_false_when_no_hash_set(self):
        user = User()
        # password_hash is None — check_password must not raise
        assert user.check_password("anything") is False

    def test_two_hashes_for_same_password_are_different(self):
        """Hashing must incorporate a salt so that identical passwords produce
        distinct hashes (guards against accidental static-salt regressions)."""
        user1, user2 = User(), User()
        user1.set_password("same-password")
        user2.set_password("same-password")
        assert user1.password_hash != user2.password_hash


class TestUserToDict:
    def test_to_dict_contains_required_keys(self):
        user = User(id="uid-1", email="alice@example.com",
                    display_name="Alice", elo=1200)
        d = user.to_dict()
        assert set(d.keys()) == {"id", "email", "displayName", "elo"}

    def test_to_dict_values_are_correct(self):
        user = User(id="uid-1", email="alice@example.com",
                    display_name="Alice", elo=1200)
        d = user.to_dict()
        assert d["id"] == "uid-1"
        assert d["email"] == "alice@example.com"
        assert d["displayName"] == "Alice"
        assert d["elo"] == 1200

    def test_to_dict_does_not_expose_password_hash(self):
        user = User(email="alice@example.com")
        user.set_password("secret")
        assert "password_hash" not in user.to_dict()
        assert "passwordHash" not in user.to_dict()

    def test_to_dict_elo_defaults_to_1000(self):
        user = User()
        assert user.to_dict()["elo"] == 1000


# ---------------------------------------------------------------------------
# CardDefinition model
# ---------------------------------------------------------------------------

class TestCardDefinitionToDict:
    def _make_card(self, **overrides):
        defaults = dict(
            id="card-001",
            figure_name="Ada Lovelace",
            era="Victorian",
            domain="Mathematics",
            influence=8,
            innovation=9,
            legacy=10,
            lore="Pioneer of computing",
            portrait_gcs_path="gs://bucket/ada.png",
            years="1815-1852",
            identities=["mathematician", "writer"],
            characteristics="Analytical mind",
            achievement="First algorithm",
        )
        defaults.update(overrides)
        return CardDefinition(**defaults)

    def test_to_dict_contains_all_required_keys(self):
        card = self._make_card()
        d = card.to_dict(tier="rare", portrait_url="https://cdn.example.com/ada.png")
        expected_keys = {
            "id", "figureName", "era", "domain",
            "influence", "innovation", "legacy",
            "tier", "lore", "portraitUrl",
            "years", "identities", "characteristics", "achievement",
        }
        assert set(d.keys()) == expected_keys

    def test_to_dict_values_match_inputs(self):
        card = self._make_card()
        d = card.to_dict(tier="epic", portrait_url="https://cdn.example.com/ada.png")
        assert d["id"] == "card-001"
        assert d["figureName"] == "Ada Lovelace"
        assert d["era"] == "Victorian"
        assert d["domain"] == "Mathematics"
        assert d["influence"] == 8
        assert d["innovation"] == 9
        assert d["legacy"] == 10
        assert d["tier"] == "epic"
        assert d["lore"] == "Pioneer of computing"
        assert d["portraitUrl"] == "https://cdn.example.com/ada.png"
        assert d["years"] == "1815-1852"
        assert d["identities"] == ["mathematician", "writer"]
        assert d["characteristics"] == "Analytical mind"
        assert d["achievement"] == "First algorithm"

    def test_to_dict_tier_default_is_common(self):
        card = self._make_card()
        d = card.to_dict()
        assert d["tier"] == "common"

    def test_to_dict_portrait_url_default_is_empty_string(self):
        card = self._make_card()
        d = card.to_dict()
        assert d["portraitUrl"] == ""

    def test_identities_defaults_to_empty_list(self):
        card = CardDefinition(id="c2", figure_name="Unknown")
        d = card.to_dict()
        assert d["identities"] == []


# ---------------------------------------------------------------------------
# Match model
# ---------------------------------------------------------------------------

class TestMatchInit:
    def test_initial_status_is_waiting(self):
        match = Match(player_a_id="user-a")
        assert match.status == "waiting"

    def test_initial_scores_are_zero(self):
        match = Match(player_a_id="user-a")
        assert match.score_a == 0
        assert match.score_b == 0

    def test_initial_round_is_1(self):
        match = Match(player_a_id="user-a")
        assert match.current_round == 1

    def test_player_b_defaults_to_none(self):
        match = Match(player_a_id="user-a")
        assert match.player_b_id is None

    def test_winner_id_defaults_to_none(self):
        match = Match(player_a_id="user-a")
        assert match.winner_id is None

    def test_id_is_auto_generated(self):
        m1, m2 = Match(), Match()
        assert m1.id != m2.id


class TestMatchToDict:
    def test_to_dict_contains_required_keys(self):
        match = Match(id="match-1", player_a_id="user-a", player_b_id="user-b")
        d = match.to_dict()
        assert "id" in d
        assert "status" in d
        assert "scoreA" in d
        assert "scoreB" in d
        assert "currentRound" in d
        assert "playerAId" in d
        assert "playerBId" in d

    def test_to_dict_reflects_current_state(self):
        match = Match(
            id="match-1",
            player_a_id="user-a",
            player_b_id="user-b",
            status="active",
            score_a=3,
            score_b=2,
            current_round=6,
        )
        d = match.to_dict()
        assert d["id"] == "match-1"
        assert d["playerAId"] == "user-a"
        assert d["playerBId"] == "user-b"
        assert d["status"] == "active"
        assert d["scoreA"] == 3
        assert d["scoreB"] == 2
        assert d["currentRound"] == 6

    def test_to_dict_does_not_include_timestamps(self):
        """Timestamps are internal; the dict representation intentionally omits them."""
        match = Match(id="match-1")
        d = match.to_dict()
        assert "createdAt" not in d
        assert "finishedAt" not in d


# ---------------------------------------------------------------------------
# Round model
# ---------------------------------------------------------------------------

class TestRoundInit:
    def test_default_winner_is_none(self):
        rnd = Round(match_id="m1", round_number=1, active_stat="influence")
        assert rnd.winner is None

    def test_card_ids_default_to_none(self):
        rnd = Round(match_id="m1", round_number=1)
        assert rnd.card_a_id is None
        assert rnd.card_b_id is None

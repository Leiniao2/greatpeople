"""
test_api_battle.py — tests for the /battle blueprint and the _resolve_round helper.

All Datastore I/O is replaced with mocks so no real GCP connection is used.
"""
import json
from unittest.mock import patch, MagicMock, call

import pytest

from models.battle import Match, Round
from models.card import CardDefinition
from api.battle import _resolve_round


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_card(card_id: str, politics=5, strength=5, culture=5,
               wealth=5, intelligence=5, technique=5, belief=5, reputation=5) -> CardDefinition:
    return CardDefinition(
        id=card_id,
        figure_name=f"Figure {card_id}",
        politics=politics,
        strength=strength,
        culture=culture,
        wealth=wealth,
        intelligence=intelligence,
        technique=technique,
        belief=belief,
        reputation=reputation,
    )


def _make_active_match(player_a="user-a", player_b="user-b",
                       score_a=0, score_b=0, current_round=1) -> Match:
    return Match(
        id="match-0000-0000-0000-000000000001",
        player_a_id=player_a,
        player_b_id=player_b,
        status="active",
        score_a=score_a,
        score_b=score_b,
        current_round=current_round,
    )


def _make_round(match: Match, stat: str = "politics",
                card_a_id: str = "card-a", card_b_id: str = "card-b") -> Round:
    return Round(
        match_id=match.id,
        round_number=match.current_round,
        active_stat=stat,
        card_a_id=card_a_id,
        card_b_id=card_b_id,
    )


def _post_json(client, url, body, headers=None):
    return client.post(
        url,
        data=json.dumps(body),
        content_type="application/json",
        headers=headers or {},
    )


# ---------------------------------------------------------------------------
# _resolve_round — pure-logic unit tests
# ---------------------------------------------------------------------------

class TestResolveRound:
    """Tests for the _resolve_round(match, rnd) helper function."""

    def _run(self, stat, val_a, val_b, score_a=0, score_b=0):
        """Convenience: build objects, mock CardDefinition.get, call _resolve_round."""
        match = _make_active_match(score_a=score_a, score_b=score_b)
        rnd = _make_round(match, stat=stat)

        card_a = _make_card("card-a", **{stat: val_a})
        card_b = _make_card("card-b", **{stat: val_b})

        def fake_get(card_id):
            return card_a if card_id == "card-a" else card_b

        with (
            patch("api.battle.CardDefinition.get", side_effect=fake_get),
            patch.object(Round, "put"),
            patch.object(Match, "put"),
            patch("api.battle._create_round"),
        ):
            _resolve_round(match, rnd)

        return match, rnd

    # -- Winner determination --------------------------------------------------

    def test_a_wins_when_val_a_greater(self):
        match, rnd = self._run("politics", val_a=8, val_b=5)
        assert rnd.winner == "A"
        assert match.score_a == 1
        assert match.score_b == 0

    def test_b_wins_when_val_b_greater(self):
        match, rnd = self._run("politics", val_a=3, val_b=7)
        assert rnd.winner == "B"
        assert match.score_b == 1
        assert match.score_a == 0

    def test_draw_when_values_equal(self):
        match, rnd = self._run("politics", val_a=5, val_b=5)
        assert rnd.winner == "draw"
        assert match.score_a == 0
        assert match.score_b == 0

    # -- Stat selection -------------------------------------------------------

    def test_uses_correct_stat_strength(self):
        match, rnd = self._run("strength", val_a=10, val_b=4)
        assert rnd.winner == "A"

    def test_uses_correct_stat_culture(self):
        match, rnd = self._run("culture", val_a=2, val_b=9)
        assert rnd.winner == "B"

    def test_uses_correct_stat_intelligence(self):
        match, rnd = self._run("intelligence", val_a=95, val_b=40)
        assert rnd.winner == "A"

    def test_uses_correct_stat_reputation(self):
        match, rnd = self._run("reputation", val_a=30, val_b=80)
        assert rnd.winner == "B"

    # -- Match completion (5 wins needed) -------------------------------------

    def test_match_finishes_when_a_reaches_5_wins(self):
        match, rnd = self._run("politics", val_a=8, val_b=5, score_a=4, score_b=2)
        assert match.status == "finished"
        assert match.winner_id == match.player_a_id

    def test_match_finishes_when_b_reaches_5_wins(self):
        match, rnd = self._run("politics", val_a=2, val_b=9, score_a=1, score_b=4)
        assert match.status == "finished"
        assert match.winner_id == match.player_b_id

    def test_match_finished_at_is_set_on_completion(self):
        match, _ = self._run("politics", val_a=8, val_b=5, score_a=4, score_b=0)
        assert match.finished_at is not None

    def test_round_increments_when_match_not_finished(self):
        """After a non-decisive round the current_round counter must advance."""
        initial_round = 3
        match = _make_active_match(score_a=2, score_b=1, current_round=initial_round)
        rnd = _make_round(match, stat="strength")

        card_a = _make_card("card-a", strength=8)
        card_b = _make_card("card-b", strength=5)

        with (
            patch("api.battle.CardDefinition.get",
                  side_effect=lambda cid: card_a if cid == "card-a" else card_b),
            patch.object(Round, "put"),
            patch.object(Match, "put"),
            patch("api.battle._create_round") as mock_create,
        ):
            _resolve_round(match, rnd)

        assert match.current_round == initial_round + 1
        mock_create.assert_called_once_with(match)

    def test_no_new_round_created_when_match_finishes(self):
        """_create_round must NOT be called when the match is over."""
        match = _make_active_match(score_a=4, score_b=0)
        rnd = _make_round(match, stat="intelligence")

        card_a = _make_card("card-a", intelligence=9)
        card_b = _make_card("card-b", intelligence=1)

        with (
            patch("api.battle.CardDefinition.get",
                  side_effect=lambda cid: card_a if cid == "card-a" else card_b),
            patch.object(Round, "put"),
            patch.object(Match, "put"),
            patch("api.battle._create_round") as mock_create,
        ):
            _resolve_round(match, rnd)

        mock_create.assert_not_called()

    def test_missing_card_counts_as_zero(self):
        """If CardDefinition.get returns None, the stat for that card is 0."""
        match = _make_active_match()
        rnd = _make_round(match, stat="culture")

        card_b = _make_card("card-b", culture=3)

        with (
            patch("api.battle.CardDefinition.get",
                  side_effect=lambda cid: None if cid == "card-a" else card_b),
            patch.object(Round, "put"),
            patch.object(Match, "put"),
            patch("api.battle._create_round"),
        ):
            _resolve_round(match, rnd)

        assert rnd.winner == "B"

    def test_round_put_is_called(self):
        """The round result must be persisted."""
        match = _make_active_match()
        rnd = _make_round(match, stat="wealth")

        card = _make_card("card-a", wealth=5)

        with (
            patch("api.battle.CardDefinition.get", return_value=card),
            patch.object(Round, "put") as mock_put,
            patch.object(Match, "put"),
            patch("api.battle._create_round"),
        ):
            _resolve_round(match, rnd)

        mock_put.assert_called_once()


# ---------------------------------------------------------------------------
# POST /battle/match  — matchmaking endpoint
# ---------------------------------------------------------------------------

class TestFindMatch:
    def test_creates_new_match_when_no_waiting_matches(self, client, auth_headers, test_user_id):
        new_match = Match(player_a_id=test_user_id)

        with (
            patch("api.battle.Match.query_waiting", return_value=[]),
            patch.object(Match, "put"),
        ):
            resp = client.post("/battle/match", headers=auth_headers)

        assert resp.status_code == 202
        body = resp.get_json()
        assert body["status"] == "waiting"
        assert body["playerAId"] == test_user_id

    def test_joins_waiting_match_when_available(self, client, auth_headers, test_user_id):
        existing = Match(
            id="existing-match-id",
            player_a_id="other-user-id",
            status="waiting",
        )

        with (
            patch("api.battle.Match.query_waiting", return_value=[existing]),
            patch.object(Match, "put"),
            patch("api.battle._create_round"),
            patch("api.battle.Round.put"),
        ):
            resp = client.post("/battle/match", headers=auth_headers)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["status"] == "active"
        assert body["playerBId"] == test_user_id

    def test_does_not_join_own_waiting_match(self, client, auth_headers, test_user_id):
        """A player cannot be matched against themselves."""
        own_match = Match(
            id="own-match-id",
            player_a_id=test_user_id,
            status="waiting",
        )

        with (
            patch("api.battle.Match.query_waiting", return_value=[own_match]),
            patch.object(Match, "put"),
        ):
            resp = client.post("/battle/match", headers=auth_headers)

        # No eligible opponent — should create a new waiting match
        assert resp.status_code == 202

    def test_requires_authentication(self, client):
        resp = client.post("/battle/match")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /battle/match/<id>/forfeit
# ---------------------------------------------------------------------------

class TestForfeit:
    def test_forfeit_sets_status_to_forfeited(self, client, auth_headers, test_user_id):
        match = Match(
            id="match-forfeit-0001",
            player_a_id=test_user_id,
            player_b_id="opponent-id",
            status="active",
        )

        with (
            patch("api.battle.Match.get", return_value=match),
            patch.object(Match, "put"),
        ):
            resp = client.post(
                f"/battle/match/{match.id}/forfeit",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["status"] == "forfeited"

    def test_forfeit_sets_winner_to_opponent(self, client, auth_headers, test_user_id):
        """When player A forfeits, player B should be set as the winner."""
        match = Match(
            id="match-forfeit-0002",
            player_a_id=test_user_id,
            player_b_id="opponent-id",
            status="active",
        )

        with (
            patch("api.battle.Match.get", return_value=match),
            patch.object(Match, "put"),
        ):
            resp = client.post(
                f"/battle/match/{match.id}/forfeit",
                headers=auth_headers,
            )

        # player A forfeited so winner should be player B
        # The endpoint returns to_dict() which doesn't include winner_id,
        # so we verify directly on the mutated match object.
        assert match.winner_id == "opponent-id"

    def test_forfeit_winner_is_player_a_when_b_forfeits(self, client, auth_headers, test_user_id):
        """When player B (= test user) forfeits, player A should win."""
        match = Match(
            id="match-forfeit-0003",
            player_a_id="player-a-id",
            player_b_id=test_user_id,
            status="active",
        )

        with (
            patch("api.battle.Match.get", return_value=match),
            patch.object(Match, "put"),
        ):
            client.post(
                f"/battle/match/{match.id}/forfeit",
                headers=auth_headers,
            )

        assert match.winner_id == "player-a-id"

    def test_forfeit_returns_404_for_unknown_match(self, client, auth_headers):
        with patch("api.battle.Match.get", return_value=None):
            resp = client.post(
                "/battle/match/nonexistent-id/forfeit",
                headers=auth_headers,
            )
        assert resp.status_code == 404

    def test_forfeit_requires_authentication(self, client):
        resp = client.post("/battle/match/some-id/forfeit")
        assert resp.status_code == 401

    def test_forfeit_put_is_called(self, client, auth_headers, test_user_id):
        """The updated match must be persisted."""
        match = Match(
            id="match-forfeit-0004",
            player_a_id=test_user_id,
            player_b_id="opponent-id",
            status="active",
        )

        with (
            patch("api.battle.Match.get", return_value=match),
            patch.object(Match, "put") as mock_put,
        ):
            client.post(
                f"/battle/match/{match.id}/forfeit",
                headers=auth_headers,
            )

        mock_put.assert_called_once()


# ---------------------------------------------------------------------------
# GET /battle/match/<id>
# ---------------------------------------------------------------------------

class TestGetMatch:
    def test_get_match_returns_200_for_existing_match(self, client, auth_headers):
        match = Match(
            id="match-get-0001",
            player_a_id="user-a",
            player_b_id="user-b",
            status="active",
        )
        with patch("api.battle.Match.get", return_value=match):
            resp = client.get("/battle/match/match-get-0001", headers=auth_headers)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["id"] == "match-get-0001"

    def test_get_match_returns_404_for_missing_match(self, client, auth_headers):
        with patch("api.battle.Match.get", return_value=None):
            resp = client.get("/battle/match/does-not-exist", headers=auth_headers)

        assert resp.status_code == 404

    def test_get_match_requires_authentication(self, client):
        resp = client.get("/battle/match/some-id")
        assert resp.status_code == 401

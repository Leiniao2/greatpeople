import random
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_socketio import SocketIO, join_room, emit
from google.cloud import ndb
from models import ndb_client
from models.battle import Match, Round

battle_bp = Blueprint('battle', __name__)

_STATS = ['influence', 'innovation', 'legacy']
_WINS_NEEDED = 5


# ── REST endpoints ─────────────────────────────────────────────────────────────

@battle_bp.post('/match')
@jwt_required()
def find_match():
    user_id = get_jwt_identity()
    waiting = Match.query(Match.status == 'waiting').fetch(20)
    opponent_match = next((m for m in waiting if m.player_a_id != user_id), None)

    if opponent_match:
        opponent_match.player_b_id = user_id
        opponent_match.status = 'active'
        _create_round(opponent_match)
        opponent_match.put()
        return jsonify(opponent_match.to_dict()), 200

    match = Match(id=str(uuid.uuid4()), player_a_id=user_id)
    match.put()
    return jsonify(match.to_dict()), 202


@battle_bp.get('/match/<match_id>')
@jwt_required()
def get_match(match_id: str):
    match = ndb.Key(Match, match_id).get()
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    return jsonify(match.to_dict())


@battle_bp.post('/match/<match_id>/move')
@jwt_required()
def make_move(match_id: str):
    user_id = get_jwt_identity()
    match = ndb.Key(Match, match_id).get()
    if not match or match.status != 'active':
        return jsonify({'error': 'Match not active'}), 400
    if user_id not in (match.player_a_id, match.player_b_id):
        return jsonify({'error': 'Not a participant'}), 403

    card_id = request.get_json().get('cardId')
    current_round = Round.query(
        Round.round_number == match.current_round,
        ancestor=match.key,
    ).get()

    if match.player_a_id == user_id:
        current_round.card_a_id = card_id
    else:
        current_round.card_b_id = card_id
    current_round.put()

    if current_round.card_a_id and current_round.card_b_id:
        _resolve_round(match, current_round)
        match.put()

    return jsonify(match.to_dict())


@battle_bp.post('/match/<match_id>/forfeit')
@jwt_required()
def forfeit(match_id: str):
    user_id = get_jwt_identity()
    match = ndb.Key(Match, match_id).get()
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    match.status = 'forfeited'
    match.winner_id = match.player_b_id if match.player_a_id == user_id else match.player_a_id
    match.finished_at = datetime.now(timezone.utc)
    match.put()
    return jsonify(match.to_dict())


@battle_bp.get('/leaderboard')
def leaderboard():
    from models.user import User
    top = User.query().order(-User.elo).fetch(50)
    return jsonify([{'userId': u.key.id(), 'displayName': u.display_name, 'elo': u.elo} for u in top])


# ── WebSocket events ───────────────────────────────────────────────────────────

def register_battle_sockets(sio: SocketIO):
    @sio.on('join_match')
    def on_join(data):
        with ndb_client.context():
            join_room(data['matchId'])
            emit('joined', {'matchId': data['matchId']}, room=data['matchId'])

    @sio.on('play_card')
    def on_play_card(data):
        emit('card_played', data, room=data['matchId'])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _create_round(match: Match) -> None:
    Round(
        parent=match.key,
        round_number=match.current_round,
        active_stat=random.choice(_STATS),
    ).put()


def _resolve_round(match: Match, rnd: Round) -> None:
    from models.card import CardDefinition

    def _stat(card_id: str) -> int:
        card = ndb.Key(CardDefinition, card_id).get()
        return getattr(card, rnd.active_stat, 0) if card else 0

    val_a, val_b = _stat(rnd.card_a_id), _stat(rnd.card_b_id)
    if val_a > val_b:
        rnd.winner, match.score_a = 'A', match.score_a + 1
    elif val_b > val_a:
        rnd.winner, match.score_b = 'B', match.score_b + 1
    else:
        rnd.winner = 'draw'
    rnd.put()

    if match.score_a >= _WINS_NEEDED:
        match.status, match.winner_id = 'finished', match.player_a_id
        match.finished_at = datetime.now(timezone.utc)
    elif match.score_b >= _WINS_NEEDED:
        match.status, match.winner_id = 'finished', match.player_b_id
        match.finished_at = datetime.now(timezone.utc)
    else:
        match.current_round += 1
        _create_round(match)

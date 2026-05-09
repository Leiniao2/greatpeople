import random
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_socketio import SocketIO, join_room, emit
from models.battle import Match, Round
from models.card import CardDefinition

battle_bp = Blueprint('battle', __name__)

_STATS = ['politics', 'strength', 'culture', 'wealth',
          'intelligence', 'technique', 'belief', 'reputation']
_WINS_NEEDED = 5


# ── REST endpoints ─────────────────────────────────────────────────────────────

@battle_bp.post('/match')
@jwt_required()
def find_match():
    user_id = get_jwt_identity()
    waiting = Match.query_waiting(limit=20)
    opponent_match = next((m for m in waiting if m.player_a_id != user_id), None)

    if opponent_match:
        opponent_match.player_b_id = user_id
        opponent_match.status = 'active'
        _create_round(opponent_match)
        opponent_match.put()
        return jsonify(opponent_match.to_dict()), 200

    match = Match(player_a_id=user_id)
    match.put()
    return jsonify(match.to_dict()), 202


@battle_bp.get('/match/<match_id>')
@jwt_required()
def get_match(match_id: str):
    match = Match.get(match_id)
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    return jsonify(match.to_dict())


@battle_bp.post('/match/<match_id>/move')
@jwt_required()
def make_move(match_id: str):
    user_id = get_jwt_identity()
    match = Match.get(match_id)
    if not match or match.status != 'active':
        return jsonify({'error': 'Match not active'}), 400
    if user_id not in (match.player_a_id, match.player_b_id):
        return jsonify({'error': 'Not a participant'}), 403

    card_id = request.get_json().get('cardId')
    current_round = Round.get_current(match_id, match.current_round)

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
    match = Match.get(match_id)
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    match.status = 'forfeited'
    match.winner_id = match.player_b_id if match.player_a_id == user_id else match.player_a_id
    match.finished_at = datetime.now(timezone.utc)
    match.put()
    return jsonify(match.to_dict())


@battle_bp.get('/leaderboard')
def leaderboard():
    from models import client
    q = client.query(kind='User')
    users = sorted(q.fetch(), key=lambda e: e.get('elo', 1000), reverse=True)[:50]
    return jsonify([
        {'userId': e.key.name, 'displayName': e.get('display_name', ''), 'elo': e.get('elo', 1000)}
        for e in users
    ])


# ── WebSocket events ───────────────────────────────────────────────────────────

def register_battle_sockets(sio: SocketIO):
    @sio.on('join_match')
    def on_join(data):
        join_room(data['matchId'])
        emit('joined', {'matchId': data['matchId']}, room=data['matchId'])

    @sio.on('play_card')
    def on_play_card(data):
        emit('card_played', data, room=data['matchId'])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _create_round(match: Match) -> None:
    Round(
        match_id=match.id,
        round_number=match.current_round,
        active_stat=random.choice(_STATS),
    ).put()


def _resolve_round(match: Match, rnd: Round) -> None:
    def _stat(card_id: str) -> int:
        card = CardDefinition.get(card_id)
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

import random
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_socketio import SocketIO, join_room, emit
from models import db
from models.battle import Match, Round

battle_bp = Blueprint("battle", __name__)

_STATS = ["influence", "innovation", "legacy"]
_WINS_NEEDED = 5


# ── REST endpoints ─────────────────────────────────────────────────────────────

@battle_bp.post("/match")
@jwt_required()
def find_match():
    user_id = get_jwt_identity()
    waiting = Match.query.filter_by(status="waiting").filter(Match.player_a_id != user_id).first()
    if waiting:
        waiting.player_b_id = user_id
        waiting.status = "active"
        _create_round(waiting)
        db.session.commit()
        return jsonify(waiting.to_dict()), 200

    match = Match(id=str(uuid.uuid4()), player_a_id=user_id)
    db.session.add(match)
    db.session.commit()
    return jsonify(match.to_dict()), 202


@battle_bp.get("/match/<match_id>")
@jwt_required()
def get_match(match_id: str):
    match = Match.query.get_or_404(match_id)
    return jsonify(match.to_dict())


@battle_bp.post("/match/<match_id>/move")
@jwt_required()
def make_move(match_id: str):
    user_id = get_jwt_identity()
    match = Match.query.get_or_404(match_id)
    if match.status != "active":
        return jsonify({"error": "Match is not active"}), 400

    data = request.get_json()
    card_id = data["cardId"]
    current_round = match.rounds.filter_by(round_number=match.current_round).first()

    if match.player_a_id == user_id:
        current_round.card_a_id = card_id
    elif match.player_b_id == user_id:
        current_round.card_b_id = card_id
    else:
        return jsonify({"error": "Not a participant"}), 403

    db.session.commit()

    if current_round.card_a_id and current_round.card_b_id:
        _resolve_round(match, current_round)
        db.session.commit()

    return jsonify(match.to_dict())


@battle_bp.post("/match/<match_id>/forfeit")
@jwt_required()
def forfeit(match_id: str):
    user_id = get_jwt_identity()
    match = Match.query.get_or_404(match_id)
    match.status = "forfeited"
    match.winner_id = match.player_b_id if match.player_a_id == user_id else match.player_a_id
    match.finished_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(match.to_dict())


@battle_bp.get("/leaderboard")
def leaderboard():
    from models.user import User
    top = User.query.order_by(User.elo.desc()).limit(50).all()
    return jsonify([{"userId": u.id, "displayName": u.display_name, "elo": u.elo} for u in top])


# ── WebSocket events ───────────────────────────────────────────────────────────

def register_battle_sockets(sio: SocketIO):
    @sio.on("join_match")
    def on_join(data):
        join_room(data["matchId"])
        emit("joined", {"matchId": data["matchId"]}, room=data["matchId"])

    @sio.on("play_card")
    def on_play_card(data):
        emit("card_played", data, room=data["matchId"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _create_round(match: Match):
    db.session.add(Round(
        match_id=match.id,
        round_number=match.current_round,
        active_stat=random.choice(_STATS),
    ))


def _resolve_round(match: Match, rnd: Round):
    from models.card import CardDefinition
    def _stat(card_id: str, stat: str) -> int:
        card = CardDefinition.query.get(card_id)
        return getattr(card, stat, 0) if card else 0

    stat = rnd.active_stat
    val_a = _stat(rnd.card_a_id, stat)
    val_b = _stat(rnd.card_b_id, stat)

    if val_a > val_b:
        rnd.winner = "A"
        match.score_a += 1
    elif val_b > val_a:
        rnd.winner = "B"
        match.score_b += 1
    else:
        rnd.winner = "draw"

    if match.score_a >= _WINS_NEEDED:
        match.status, match.winner_id, match.finished_at = "finished", match.player_a_id, datetime.now(timezone.utc)
    elif match.score_b >= _WINS_NEEDED:
        match.status, match.winner_id, match.finished_at = "finished", match.player_b_id, datetime.now(timezone.utc)
    else:
        match.current_round += 1
        _create_round(match)

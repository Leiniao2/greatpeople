import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.card import CardDefinition, UserCard
from models.user import User

cards_bp = Blueprint('cards', __name__)


@cards_bp.get('/cards')
@jwt_required()
def get_cards():
    user_id = get_jwt_identity()
    cards = UserCard.get_all_for_user(user_id)
    return jsonify({'cards': [_to_dict(uc) for uc in cards]})


@cards_bp.get('/cards/<card_id>')
@jwt_required()
def get_card(card_id: str):
    user_id = get_jwt_identity()
    uc = UserCard.find(user_id, card_id)
    if not uc:
        return jsonify({'error': 'Card not found'}), 404
    return jsonify(_to_dict(uc))


@cards_bp.post('/cards/sync')
@jwt_required()
def sync_cards():
    user_id = get_jwt_identity()
    incoming = request.get_json().get('cards', [])

    for card_data in incoming:
        if not UserCard.find(user_id, card_data['id'], tier=card_data.get('tier', 'common')):
            UserCard(
                user_id=user_id,
                card_definition_id=card_data['id'],
                tier=card_data.get('tier', 'common'),
            ).put()

    return jsonify({'cards': [_to_dict(uc) for uc in UserCard.get_all_for_user(user_id)]})


def _to_dict(uc: UserCard) -> dict:
    defn = CardDefinition.get(uc.card_definition_id)
    if not defn:
        return {'id': uc.card_definition_id, 'tier': uc.tier}
    return defn.to_dict(tier=uc.tier)


# ── Story progress ────────────────────────────────────────────────────────────
# The web app keeps story completion and unlocked cards in a small JSON
# document; this stores it per user so web and the native apps share it.

PROGRESS_MAX_BYTES = 64 * 1024
EMPTY_PROGRESS = {'version': 1, 'updatedAt': None, 'stories': {}, 'unlockedCards': []}


@cards_bp.get('/progress')
@jwt_required()
def get_progress():
    user = User.get(get_jwt_identity())
    if not user:
        return jsonify({'error': 'User not found'}), 404
    doc = json.loads(user.progress_json) if user.progress_json else EMPTY_PROGRESS
    return jsonify(doc)


@cards_bp.put('/progress')
@jwt_required()
def put_progress():
    doc = request.get_json(silent=True)
    if not isinstance(doc, dict) or not isinstance(doc.get('stories'), dict) \
            or not isinstance(doc.get('unlockedCards'), list):
        return jsonify({'error': 'progress document must have stories and unlockedCards'}), 400
    raw = json.dumps(doc, separators=(',', ':'))
    if len(raw.encode('utf-8')) > PROGRESS_MAX_BYTES:
        return jsonify({'error': 'progress document too large'}), 413
    user = User.get(get_jwt_identity())
    if not user:
        return jsonify({'error': 'User not found'}), 404
    user.progress_json = raw
    user.put()
    return jsonify(doc)

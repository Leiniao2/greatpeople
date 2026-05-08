from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.card import CardDefinition, UserCard

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

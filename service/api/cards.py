from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from google.cloud import ndb
from models.card import CardDefinition, UserCard
from models.user import User

cards_bp = Blueprint('cards', __name__)


@cards_bp.get('/cards')
@jwt_required()
def get_cards():
    user_key = ndb.Key(User, get_jwt_identity())
    user_cards = UserCard.query(ancestor=user_key).fetch()
    return jsonify({'cards': [_to_dict(uc) for uc in user_cards]})


@cards_bp.get('/cards/<card_id>')
@jwt_required()
def get_card(card_id: str):
    user_key = ndb.Key(User, get_jwt_identity())
    uc = UserCard.query(UserCard.card_definition_id == card_id, ancestor=user_key).get()
    if not uc:
        return jsonify({'error': 'Card not found'}), 404
    return jsonify(_to_dict(uc))


@cards_bp.post('/cards/sync')
@jwt_required()
def sync_cards():
    user_key = ndb.Key(User, get_jwt_identity())
    incoming = request.get_json().get('cards', [])

    to_put = []
    for card_data in incoming:
        exists = UserCard.query(
            UserCard.card_definition_id == card_data['id'],
            UserCard.tier == card_data['tier'],
            ancestor=user_key,
        ).get()
        if not exists:
            to_put.append(UserCard(
                parent=user_key,
                card_definition_id=card_data['id'],
                tier=card_data.get('tier', 'common'),
            ))
    if to_put:
        ndb.put_multi(to_put)

    all_cards = UserCard.query(ancestor=user_key).fetch()
    return jsonify({'cards': [_to_dict(uc) for uc in all_cards]})


def _to_dict(uc: UserCard) -> dict:
    defn = ndb.Key(CardDefinition, uc.card_definition_id).get()
    if not defn:
        return {'id': uc.card_definition_id, 'tier': uc.tier}
    return defn.to_dict(tier=uc.tier)

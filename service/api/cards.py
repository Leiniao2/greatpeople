from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db
from models.card import CardDefinition, UserCard
from models.user import User

cards_bp = Blueprint("cards", __name__)


@cards_bp.get("/cards")
@jwt_required()
def get_cards():
    user_id = get_jwt_identity()
    user_cards = UserCard.query.filter_by(user_id=user_id).all()
    return jsonify({"cards": [_card_to_dict(uc) for uc in user_cards]})


@cards_bp.get("/cards/<card_id>")
@jwt_required()
def get_card(card_id: str):
    user_id = get_jwt_identity()
    uc = UserCard.query.filter_by(user_id=user_id, card_definition_id=card_id).first_or_404()
    return jsonify(_card_to_dict(uc))


@cards_bp.post("/cards/sync")
@jwt_required()
def sync_cards():
    user_id = get_jwt_identity()
    incoming = request.get_json().get("cards", [])

    for card_data in incoming:
        existing = UserCard.query.filter_by(
            user_id=user_id,
            card_definition_id=card_data["id"],
            tier=card_data["tier"],
        ).first()
        if not existing:
            db.session.add(UserCard(
                user_id=user_id,
                card_definition_id=card_data["id"],
                tier=card_data["tier"],
            ))

    db.session.commit()
    all_cards = UserCard.query.filter_by(user_id=user_id).all()
    return jsonify({"cards": [_card_to_dict(uc) for uc in all_cards]})


def _card_to_dict(uc: UserCard) -> dict:
    return uc.definition.to_dict(tier=uc.tier)

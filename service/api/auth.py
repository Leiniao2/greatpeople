import uuid
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity
from models import db
from models.user import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/register")
def register():
    data = request.get_json()
    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered"}), 409
    user = User(id=str(uuid.uuid4()), email=data["email"], display_name=data["displayName"])
    user.set_password(data["password"])
    db.session.add(user)
    db.session.commit()
    return jsonify(_tokens(user.id)), 201


@auth_bp.post("/login")
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data["email"]).first()
    if not user or not user.check_password(data["password"]):
        return jsonify({"error": "Invalid credentials"}), 401
    return jsonify(_tokens(user.id))


@auth_bp.post("/logout")
@jwt_required()
def logout():
    # Stateless JWT: client discards token; add a denylist here for stricter security
    return jsonify({"message": "Logged out"}), 200


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    return jsonify({"accessToken": create_access_token(identity=identity)})


def _tokens(user_id: str) -> dict:
    return {
        "accessToken": create_access_token(identity=user_id),
        "refreshToken": create_refresh_token(identity=user_id),
    }

import uuid
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity,
)
from models.user import User

auth_bp = Blueprint('auth', __name__)


@auth_bp.post('/register')
def register():
    data = request.get_json()
    if not data or not all(k in data for k in ('email', 'password', 'displayName')):
        return jsonify({'error': 'email, password and displayName are required'}), 400

    if User.get_by_email(data['email']):
        return jsonify({'error': 'Email already registered'}), 409

    user = User(
        id=str(uuid.uuid4()),
        email=data['email'].lower().strip(),
        display_name=data['displayName'].strip(),
    )
    user.set_password(data['password'])
    user.put()

    return jsonify(_tokens(user.key.id())), 201


@auth_bp.post('/login')
def login():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    user = User.get_by_email((data.get('email') or '').lower().strip())
    if not user or not user.check_password(data.get('password', '')):
        return jsonify({'error': 'Invalid credentials'}), 401

    return jsonify(_tokens(user.key.id()))


@auth_bp.post('/logout')
@jwt_required()
def logout():
    # Stateless JWT — client discards the token.
    # Add an NDB-backed token denylist here for stricter security.
    return jsonify({'message': 'Logged out'}), 200


@auth_bp.post('/refresh')
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    return jsonify({'accessToken': create_access_token(identity=identity)})


@auth_bp.get('/me')
@jwt_required()
def me():
    from google.cloud import ndb
    user = ndb.Key(User, get_jwt_identity()).get()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify(user.to_dict())


def _tokens(user_id: str) -> dict:
    return {
        'accessToken': create_access_token(identity=user_id),
        'refreshToken': create_refresh_token(identity=user_id),
    }

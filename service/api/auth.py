import uuid
import requests as http
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity,
)
from google.cloud import ndb
from models.user import User

auth_bp = Blueprint('auth', __name__)


# ── Email / password ──────────────────────────────────────────────────────────

@auth_bp.post('/register')
def register():
    data = request.get_json()
    if not data or not all(k in data for k in ('email', 'password', 'displayName')):
        return jsonify({'error': 'email, password and displayName are required'}), 400
    if User.get_by_email(data['email'].lower().strip()):
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
    data = request.get_json() or {}
    user = User.get_by_email((data.get('email') or '').lower().strip())
    if not user or not user.check_password(data.get('password', '')):
        return jsonify({'error': 'Invalid credentials'}), 401
    return jsonify(_tokens(user.key.id()))


@auth_bp.post('/logout')
@jwt_required()
def logout():
    return jsonify({'message': 'Logged out'}), 200


@auth_bp.post('/refresh')
@jwt_required(refresh=True)
def refresh():
    return jsonify({'accessToken': create_access_token(identity=get_jwt_identity())})


@auth_bp.get('/me')
@jwt_required()
def me():
    user = ndb.Key(User, get_jwt_identity()).get()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify(user.to_dict())


# ── Google SSO ────────────────────────────────────────────────────────────────

@auth_bp.post('/google')
def google_sso():
    access_token = (request.get_json() or {}).get('accessToken')
    if not access_token:
        return jsonify({'error': 'accessToken required'}), 400

    resp = http.get(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=10,
    )
    if not resp.ok:
        return jsonify({'error': 'Invalid Google token'}), 401

    info = resp.json()
    user = _find_or_create_sso_user(
        provider='google',
        oauth_id=info['sub'],
        email=info.get('email', ''),
        display_name=info.get('name', ''),
    )
    return jsonify(_tokens(user.key.id()))


# ── Facebook SSO ──────────────────────────────────────────────────────────────

@auth_bp.post('/facebook')
def facebook_sso():
    access_token = (request.get_json() or {}).get('accessToken')
    if not access_token:
        return jsonify({'error': 'accessToken required'}), 400

    resp = http.get(
        'https://graph.facebook.com/me',
        params={'fields': 'id,name,email', 'access_token': access_token},
        timeout=10,
    )
    info = resp.json()
    if not resp.ok or 'error' in info:
        return jsonify({'error': 'Invalid Facebook token'}), 401

    user = _find_or_create_sso_user(
        provider='facebook',
        oauth_id=info['id'],
        email=info.get('email', ''),
        display_name=info.get('name', ''),
    )
    return jsonify(_tokens(user.key.id()))


# ── Shared helpers ────────────────────────────────────────────────────────────

def _find_or_create_sso_user(provider: str, oauth_id: str, email: str, display_name: str) -> User:
    # 1. Try exact OAuth match (returning user)
    user = User.get_by_oauth(provider, oauth_id)
    if user:
        return user

    # 2. Try email match — link the social account to an existing email/password account
    if email:
        user = User.get_by_email(email.lower())
        if user:
            user.oauth_provider = provider
            user.oauth_id = oauth_id
            user.put()
            return user

    # 3. New user
    user = User(
        id=str(uuid.uuid4()),
        email=email.lower() if email else f'{provider}_{oauth_id}@sso',
        display_name=display_name or (email.split('@')[0] if email else provider),
        oauth_provider=provider,
        oauth_id=oauth_id,
    )
    user.put()
    return user


def _tokens(user_id: str) -> dict:
    return {
        'accessToken': create_access_token(identity=user_id),
        'refreshToken': create_refresh_token(identity=user_id),
    }

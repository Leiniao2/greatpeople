import uuid
from google.cloud import datastore
from werkzeug.security import generate_password_hash, check_password_hash
from models import client


class User:
    KIND = 'User'

    def __init__(self, id=None, email='', display_name='',
                 password_hash=None, oauth_provider=None, oauth_id=None, elo=1000):
        self.id = id or str(uuid.uuid4())
        self.email = email
        self.display_name = display_name
        self.password_hash = password_hash
        self.oauth_provider = oauth_provider
        self.oauth_id = oauth_id
        self.elo = elo

    @classmethod
    def get(cls, user_id: str) -> 'User | None':
        entity = client.get(client.key(cls.KIND, user_id))
        return cls._from_entity(entity) if entity else None

    @classmethod
    def get_by_email(cls, email: str) -> 'User | None':
        q = client.query(kind=cls.KIND)
        q.add_filter('email', '=', email)
        for entity in q.fetch(limit=1):
            return cls._from_entity(entity)
        return None

    @classmethod
    def get_by_oauth(cls, provider: str, oauth_id: str) -> 'User | None':
        q = client.query(kind=cls.KIND)
        q.add_filter('oauth_id', '=', oauth_id)
        for entity in q.fetch(limit=1):
            user = cls._from_entity(entity)
            return user if user.oauth_provider == provider else None
        return None

    def put(self) -> None:
        key = client.key(self.KIND, self.id)
        entity = datastore.Entity(key=key, exclude_from_indexes=['password_hash'])
        entity.update({
            'email': self.email,
            'display_name': self.display_name,
            'password_hash': self.password_hash,
            'oauth_provider': self.oauth_provider,
            'oauth_id': self.oauth_id,
            'elo': self.elo,
        })
        client.put(entity)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return bool(self.password_hash and check_password_hash(self.password_hash, password))

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'email': self.email,
            'displayName': self.display_name,
            'elo': self.elo,
        }

    @classmethod
    def _from_entity(cls, entity) -> 'User':
        return cls(
            id=entity.key.name,
            email=entity.get('email', ''),
            display_name=entity.get('display_name', ''),
            password_hash=entity.get('password_hash'),
            oauth_provider=entity.get('oauth_provider'),
            oauth_id=entity.get('oauth_id'),
            elo=entity.get('elo', 1000),
        )

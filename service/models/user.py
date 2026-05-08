from google.cloud import ndb
from werkzeug.security import generate_password_hash, check_password_hash


class User(ndb.Model):
    email = ndb.StringProperty(required=True, indexed=True)
    display_name = ndb.StringProperty(required=True)
    password_hash = ndb.StringProperty(required=True)
    created_at = ndb.DateTimeProperty(auto_now_add=True)
    elo = ndb.IntegerProperty(default=1000)

    @classmethod
    def get_by_email(cls, email: str) -> 'User | None':
        return cls.query(cls.email == email).get()

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self) -> dict:
        return {
            'id': self.key.id(),
            'email': self.email,
            'displayName': self.display_name,
            'elo': self.elo,
        }

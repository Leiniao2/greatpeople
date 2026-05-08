from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from models import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    elo = db.Column(db.Integer, default=1000)

    cards = db.relationship("UserCard", back_populates="user", lazy="dynamic")

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {"id": self.id, "email": self.email, "displayName": self.display_name, "elo": self.elo}

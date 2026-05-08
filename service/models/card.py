from datetime import datetime, timezone
from models import db


class CardDefinition(db.Model):
    """Master catalogue of all cards — populated by game admins."""
    __tablename__ = "card_definitions"

    id = db.Column(db.String(36), primary_key=True)
    figure_name = db.Column(db.String(100), nullable=False)
    era = db.Column(db.String(50))
    domain = db.Column(db.String(50))
    influence = db.Column(db.Integer, nullable=False)
    innovation = db.Column(db.Integer, nullable=False)
    legacy = db.Column(db.Integer, nullable=False)
    lore = db.Column(db.Text)
    portrait_gcs_path = db.Column(db.String(255))  # Cloud Storage object path

    def to_dict(self, tier: str = "common", portrait_url: str = "") -> dict:
        return {
            "id": self.id,
            "figureName": self.figure_name,
            "era": self.era,
            "domain": self.domain,
            "influence": self.influence,
            "innovation": self.innovation,
            "legacy": self.legacy,
            "tier": tier,
            "lore": self.lore,
            "portraitUrl": portrait_url,
        }


class UserCard(db.Model):
    """A card instance owned by a player."""
    __tablename__ = "user_cards"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    card_definition_id = db.Column(db.String(36), db.ForeignKey("card_definitions.id"), nullable=False)
    tier = db.Column(db.String(20), nullable=False, default="common")
    earned_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="cards")
    definition = db.relationship("CardDefinition")

    __table_args__ = (db.UniqueConstraint("user_id", "card_definition_id", "tier"),)

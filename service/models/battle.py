from datetime import datetime, timezone
from models import db


class Match(db.Model):
    __tablename__ = "matches"

    id = db.Column(db.String(36), primary_key=True)
    player_a_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    player_b_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="waiting")
    # waiting | active | finished | forfeited
    winner_id = db.Column(db.String(36), nullable=True)
    score_a = db.Column(db.Integer, default=0)
    score_b = db.Column(db.Integer, default=0)
    current_round = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = db.Column(db.DateTime, nullable=True)

    rounds = db.relationship("Round", back_populates="match", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "playerAId": self.player_a_id,
            "playerBId": self.player_b_id,
            "status": self.status,
            "scoreA": self.score_a,
            "scoreB": self.score_b,
            "currentRound": self.current_round,
        }


class Round(db.Model):
    __tablename__ = "rounds"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    match_id = db.Column(db.String(36), db.ForeignKey("matches.id"), nullable=False)
    round_number = db.Column(db.Integer, nullable=False)
    active_stat = db.Column(db.String(20), nullable=False)  # influence | innovation | legacy
    card_a_id = db.Column(db.String(36), nullable=True)
    card_b_id = db.Column(db.String(36), nullable=True)
    winner = db.Column(db.String(1), nullable=True)  # "A" | "B" | "draw"

    match = db.relationship("Match", back_populates="rounds")

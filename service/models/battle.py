from google.cloud import ndb


class Match(ndb.Model):
    player_a_id = ndb.StringProperty(required=True, indexed=True)
    player_b_id = ndb.StringProperty(indexed=True)
    status = ndb.StringProperty(default='waiting', indexed=True)
    # waiting | active | finished | forfeited
    winner_id = ndb.StringProperty()
    score_a = ndb.IntegerProperty(default=0)
    score_b = ndb.IntegerProperty(default=0)
    current_round = ndb.IntegerProperty(default=1)
    created_at = ndb.DateTimeProperty(auto_now_add=True)
    finished_at = ndb.DateTimeProperty()

    def to_dict(self) -> dict:
        return {
            'id': self.key.id(),
            'playerAId': self.player_a_id,
            'playerBId': self.player_b_id,
            'status': self.status,
            'scoreA': self.score_a,
            'scoreB': self.score_b,
            'currentRound': self.current_round,
        }


class Round(ndb.Model):
    """Parent key must be the Match key."""
    round_number = ndb.IntegerProperty(required=True)
    active_stat = ndb.StringProperty(required=True)   # influence | innovation | legacy
    card_a_id = ndb.StringProperty()
    card_b_id = ndb.StringProperty()
    winner = ndb.StringProperty()                      # 'A' | 'B' | 'draw'

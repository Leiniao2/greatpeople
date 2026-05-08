import uuid
from datetime import datetime, timezone
from google.cloud import datastore
from models import client


class Match:
    KIND = 'Match'

    def __init__(self, id=None, player_a_id='', player_b_id=None,
                 status='waiting', winner_id=None,
                 score_a=0, score_b=0, current_round=1,
                 created_at=None, finished_at=None):
        self.id = id or str(uuid.uuid4())
        self.player_a_id = player_a_id
        self.player_b_id = player_b_id
        self.status = status
        self.winner_id = winner_id
        self.score_a = score_a
        self.score_b = score_b
        self.current_round = current_round
        self.created_at = created_at
        self.finished_at = finished_at

    @classmethod
    def get(cls, match_id: str) -> 'Match | None':
        entity = client.get(client.key(cls.KIND, match_id))
        return cls._from_entity(entity) if entity else None

    @classmethod
    def query_waiting(cls, limit: int = 20) -> list['Match']:
        q = client.query(kind=cls.KIND)
        q.add_filter('status', '=', 'waiting')
        return [cls._from_entity(e) for e in q.fetch(limit=limit)]

    def put(self) -> None:
        key = client.key(self.KIND, self.id)
        entity = datastore.Entity(key=key)
        entity.update({
            'player_a_id': self.player_a_id,
            'player_b_id': self.player_b_id,
            'status': self.status,
            'winner_id': self.winner_id,
            'score_a': self.score_a,
            'score_b': self.score_b,
            'current_round': self.current_round,
            'created_at': self.created_at or datetime.now(timezone.utc),
            'finished_at': self.finished_at,
        })
        client.put(entity)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'playerAId': self.player_a_id,
            'playerBId': self.player_b_id,
            'status': self.status,
            'scoreA': self.score_a,
            'scoreB': self.score_b,
            'currentRound': self.current_round,
        }

    @classmethod
    def _from_entity(cls, entity) -> 'Match':
        return cls(
            id=entity.key.name,
            player_a_id=entity.get('player_a_id', ''),
            player_b_id=entity.get('player_b_id'),
            status=entity.get('status', 'waiting'),
            winner_id=entity.get('winner_id'),
            score_a=entity.get('score_a', 0),
            score_b=entity.get('score_b', 0),
            current_round=entity.get('current_round', 1),
            created_at=entity.get('created_at'),
            finished_at=entity.get('finished_at'),
        )


class Round:
    KIND = 'Round'

    def __init__(self, id=None, match_id='', round_number=1,
                 active_stat='', card_a_id=None, card_b_id=None, winner=None):
        self.id = id or str(round_number)
        self.match_id = match_id
        self.round_number = round_number
        self.active_stat = active_stat
        self.card_a_id = card_a_id
        self.card_b_id = card_b_id
        self.winner = winner

    @classmethod
    def get_current(cls, match_id: str, round_number: int) -> 'Round | None':
        key = client.key('Match', match_id, cls.KIND, str(round_number))
        entity = client.get(key)
        return cls._from_entity(entity, match_id) if entity else None

    def put(self) -> None:
        key = client.key('Match', self.match_id, self.KIND, str(self.round_number))
        entity = datastore.Entity(key=key)
        entity.update({
            'round_number': self.round_number,
            'active_stat': self.active_stat,
            'card_a_id': self.card_a_id,
            'card_b_id': self.card_b_id,
            'winner': self.winner,
        })
        client.put(entity)

    @classmethod
    def _from_entity(cls, entity, match_id: str) -> 'Round':
        return cls(
            id=entity.key.name,
            match_id=match_id,
            round_number=entity.get('round_number', 1),
            active_stat=entity.get('active_stat', ''),
            card_a_id=entity.get('card_a_id'),
            card_b_id=entity.get('card_b_id'),
            winner=entity.get('winner'),
        )

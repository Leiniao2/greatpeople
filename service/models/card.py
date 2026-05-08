import uuid
from google.cloud import datastore
from models import client


class CardDefinition:
    KIND = 'CardDefinition'

    def __init__(self, id=None, figure_name='', era='', domain='',
                 influence=0, innovation=0, legacy=0, lore='', portrait_gcs_path='',
                 years='', identities=None, characteristics='', achievement=''):
        self.id = id
        self.figure_name = figure_name
        self.era = era
        self.domain = domain
        self.influence = influence
        self.innovation = innovation
        self.legacy = legacy
        self.lore = lore
        self.portrait_gcs_path = portrait_gcs_path
        self.years = years
        self.identities = identities or []
        self.characteristics = characteristics
        self.achievement = achievement

    @classmethod
    def get(cls, card_id: str) -> 'CardDefinition | None':
        entity = client.get(client.key(cls.KIND, card_id))
        return cls._from_entity(entity) if entity else None

    def to_dict(self, tier: str = 'common', portrait_url: str = '') -> dict:
        return {
            'id': self.id,
            'figureName': self.figure_name,
            'era': self.era,
            'domain': self.domain,
            'influence': self.influence,
            'innovation': self.innovation,
            'legacy': self.legacy,
            'tier': tier,
            'lore': self.lore,
            'portraitUrl': portrait_url,
            'years': self.years,
            'identities': self.identities,
            'characteristics': self.characteristics,
            'achievement': self.achievement,
        }

    @classmethod
    def _from_entity(cls, entity) -> 'CardDefinition':
        return cls(
            id=entity.key.name,
            figure_name=entity.get('figure_name', ''),
            era=entity.get('era', ''),
            domain=entity.get('domain', ''),
            influence=entity.get('influence', 0),
            innovation=entity.get('innovation', 0),
            legacy=entity.get('legacy', 0),
            lore=entity.get('lore', ''),
            portrait_gcs_path=entity.get('portrait_gcs_path', ''),
            years=entity.get('years', ''),
            identities=list(entity.get('identities', [])),
            characteristics=entity.get('characteristics', ''),
            achievement=entity.get('achievement', ''),
        )


class UserCard:
    KIND = 'UserCard'

    def __init__(self, id=None, user_id='', card_definition_id='', tier='common'):
        self.id = id or str(uuid.uuid4())
        self.user_id = user_id
        self.card_definition_id = card_definition_id
        self.tier = tier

    @classmethod
    def get_all_for_user(cls, user_id: str) -> list['UserCard']:
        ancestor = client.key('User', user_id)
        q = client.query(kind=cls.KIND, ancestor=ancestor)
        return [cls._from_entity(e, user_id) for e in q.fetch()]

    @classmethod
    def find(cls, user_id: str, card_definition_id: str, tier: str = None) -> 'UserCard | None':
        ancestor = client.key('User', user_id)
        q = client.query(kind=cls.KIND, ancestor=ancestor)
        q.add_filter('card_definition_id', '=', card_definition_id)
        if tier:
            q.add_filter('tier', '=', tier)
        for entity in q.fetch(limit=1):
            return cls._from_entity(entity, user_id)
        return None

    def put(self) -> None:
        key = client.key('User', self.user_id, self.KIND, self.id)
        entity = datastore.Entity(key=key)
        entity.update({'card_definition_id': self.card_definition_id, 'tier': self.tier})
        client.put(entity)

    @classmethod
    def _from_entity(cls, entity, user_id: str) -> 'UserCard':
        return cls(
            id=entity.key.name or str(entity.key.id),
            user_id=user_id,
            card_definition_id=entity.get('card_definition_id', ''),
            tier=entity.get('tier', 'common'),
        )

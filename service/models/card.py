from google.cloud import ndb


class CardDefinition(ndb.Model):
    """Master catalogue — populated by game admins."""
    figure_name = ndb.StringProperty(required=True)
    era = ndb.StringProperty(indexed=False)
    domain = ndb.StringProperty()
    influence = ndb.IntegerProperty(required=True)
    innovation = ndb.IntegerProperty(required=True)
    legacy = ndb.IntegerProperty(required=True)
    lore = ndb.TextProperty()
    portrait_gcs_path = ndb.StringProperty(indexed=False)

    def to_dict(self, tier: str = 'common', portrait_url: str = '') -> dict:
        return {
            'id': self.key.id(),
            'figureName': self.figure_name,
            'era': self.era,
            'domain': self.domain,
            'influence': self.influence,
            'innovation': self.innovation,
            'legacy': self.legacy,
            'tier': tier,
            'lore': self.lore,
            'portraitUrl': portrait_url,
        }


class UserCard(ndb.Model):
    """A card instance owned by a player. Parent key must be the User key."""
    card_definition_id = ndb.StringProperty(required=True, indexed=True)
    tier = ndb.StringProperty(required=True, default='common', indexed=True)
    earned_at = ndb.DateTimeProperty(auto_now_add=True)

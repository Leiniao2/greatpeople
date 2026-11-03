# Story sources

One file per Epic story, `data/stories/<era>/<slug>.json`. These are the
files to edit. `scripts/build-stories.mjs` turns them into the three JSONs
the apps read (`story_configs.json`, `story_challenges.json`,
`story_scripts.json`), and `scripts/validate-stories.mjs` checks them. The
pre-commit hook runs both, then syncs the outputs to web, iOS and Android.

```jsonc
{
  "slug": "pyramid-builders",          // unique; used in ids and URLs
  "era": "Ancient",
  "title": "Pyramid Builders",
  "figure": "Imhotep",                 // card unlocked on completion, or null
  "portraitKey": "imhotep",
  "tagline": "Stone by stone, an immortal legacy rises from the desert.",
  "locationImage": "ancient_memphis",  // optional; key under data/images/locations
  "bonusCard": { "figureName": "Enkidu", "portraitKey": "enkidu" },  // optional
  "lives": 3,
  "stages": [
    {
      "key": "origins", "label": "Origins", "difficulty": 1,
      "intro": "A young scribe in the court of Djoser…",   // optional stage card text
      "scenes": [
        { "type": "narration", "text": "…" },
        { "type": "dialog", "speaker": "Djoser", "portraitKey": "follower:sovereign", "text": "…" },
        { "type": "challenge", "challenge": { /* see below */ } }
      ]
    },
    { "key": "trial",   "label": "Trial",   "difficulty": 2, "scenes": [] },
    { "key": "mastery", "label": "Mastery", "difficulty": 3, "scenes": [] },
    { "key": "legacy",  "label": "Legacy",  "difficulty": 4, "scenes": [] }
  ]
}
```

A story is a growth arc: four stages in this order, difficulty 1 → 4, each
with at least one challenge. Challenges sit inline in the scene where they
are played, so there is no index to keep in step.

## Challenges

Every challenge has a `fact` (shown after it is played) and may have a
`hint` (shown from the second attempt) and a `countdown` in seconds.

```jsonc
{ "type": "minigame", "game": "maze", "configId": "cedar-forest",
  "params": { "monsterCount": 3 }, "seed": 7,
  "instruction": "Guide Gilgamesh through the Cedar Forest…", "fact": "…" }

{ "type": "quiz", "question": "…", "options": ["a", "b", "c", "d"], "answer": 1, "fact": "…" }
{ "type": "truefalse", "statement": "…", "correct": true, "fact": "…" }
{ "type": "sort", "question": "…", "items": ["first", "second", "third"], "fact": "…" }
```

`game` must be a key of `web/src/games/registry.ts`. `configId` names a
config inside that game's component; `params` are merged over it, so a
procedural game can be authored with `params` alone. Quiz, true/false and
sort together may make up at most 5% of all challenges.

`portraitKey` values on dialog scenes are a card's `portraitKey`, or
`follower:<imageKey>` for a follower card.

## The closing fight lesson

Every story's last challenge is a `fight` minigame: a small scripted battle
on the real board that teaches one more rule of the card game. The tier
(`configId`) follows the era, so the Epic reads as a curriculum:

| Era | Tier | Board | Teaches |
|---|---|---|---|
| Ancient | `duel` | 1 location, hero + ally, 1 follower, rival already there | deploy, follower, attack |
| Classical | `reinforce` | 1 location, two rivals and a follower | stacking a side, two attacks |
| Medieval | `event` | 2 locations, event card in hand | starting an event |
| Renaissance | `survival` | 2 locations, local survival running | round endings, threshold 5 |
| Steam | `hidden` | 2 locations, face-down rivals | public / private, reveal by attack |
| Electricity | `competition` | 3 locations, global competition card | public totals across the board |
| Information | `conquest` | 3 locations, rivals in hand | kill mode, elimination, achievements |

`scripts/add-fight-lessons.mjs` appends the lesson (a hero dialog and the
challenge) to the Legacy stage of any story that lacks one, choosing the
cast from `data/cards.json`: the story's figure as hero, the hero's best stat,
same-era rivals a little weaker in that stat, followers of that stat (the
hero's own identities first, for the +3), and the story's city first among
the locations. The cast is written into the challenge as `params`, so it can
be edited by hand; the tiers, goals and coach live in
`web/src/battle/lessons.ts`, and `web/src/test/fight_lessons.test.ts` plays
every story's lesson through the engine to prove the coached line wins.

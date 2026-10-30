# Fight knowledge audit

An inventory of everything in this repo that defines how battles ("fights")
work, what the shipped web engine actually does, and where the two disagree.
Maintained with the internal **Fight Studio** tool in
[`tools/fight-studio/`](../tools/fight-studio/README.md); the row-level
record lives in [`fight_rules.json`](fight_rules.json).

Audited 2026-10-29 against `web/src/pages/BattlePage.tsx`.

## 1. Where fight knowledge lives

| Kind | File | What it holds |
|---|---|---|
| doc | [`fight.md`](fight.md) | The board-game rulebook: setup, turn actions A–I, public/private cards, 8 stats × 3 scenarios, natural hazards, archiving, turn order, end of game. |
| doc | [`great-people-card.md`](great-people-card.md) | Card attributes (7 eras, 32 identities, 8 stats, trait, achievement), follower and location attributes, building lists per era. Also an **older** 10-card, 3-stat round game under "Battle System". |
| doc | [`great-people-trait-idea.md`](great-people-trait-idea.md) | 28 draft traits and achievements; several blank or differing from `cards.json`. |
| doc | [`era.md`](era.md) | Era year ranges. |
| doc | [`fight_rules.json`](fight_rules.json) | Rules registry: one row per rule with doc text, engine behaviour, status, notes. |
| data | `data/cards.json` | 80 Great People: stats on a 1–12 scale, identities, era, gender, trait text, achievement text. Source of truth, synced to web/iOS/Android. |
| data | `data/demo_cards.json` | Same 80 figures on a 1–24 scale (collection demos, not battle). |
| data | `data/followers.json` | 32 follower templates: identity → stat, bonus 2. |
| data | `data/location_cards.json` | 142 location cards: buildings, capacity, per-stat bonuses, trait text (web only). |
| data | `data/locations.json` | 140 locations drawn for the board. |
| code | `web/src/pages/BattlePage.tsx` | The only battle engine: decks, reducer (deploy, move, attack, events, achievements), trait bonuses, CPU AI, UI. |
| code | `web/src/types/index.ts` | Battle state types. |
| code | `service/api/battle.py`, `service/models/battle.py` | Legacy server match: one stat per round, first to 5. Not the board game. |
| text | `ios/.../Battle/BattleView.swift`, `android/.../BattleScreen.kt` | Rules summary dialogs only (survival < 10, hazard < 100). No engine. |

## 2. What the engine implements

Constants (all hard-coded in `BattlePage.tsx`):

| Rule | Engine | `fight.md` |
|---|---|---|
| Locations per game | 7 | not stated |
| Starting hand | 4 GP, 2 events, 8 followers | same |
| Follower deck | 3 × 32 = 96 | not stated |
| Follower bonus | 2, or 3 when an allied GP at the location has the follower's identity | "any follower bonus" |
| Location bonus | per-stat bonus from `location_cards.json`, added to every GP in conflicts only | not in doc |
| Local survival | player's stat total at the location ≥ 5 survives | below 10 dies |
| Natural hazard | minimum over the 8 per-stat totals ≥ 5 survives; 20% chance per round on the busiest location; 1 round | all-stat total below 100 dies; random; 1 round |
| Global competition | sum of public GP base stats only; 1 round; reward 2 events / 4 followers / 1 GP | all public cards; same rewards |
| Achievement | 1 "tick" when the GP kills an enemy GP (≥ 5 in the mapped stat) in a conflict of the GP's mapped stat; 47 figures need 1 tick, the other 33 are unmapped and can never tick | the card's own achievement text |
| Winning | 5 points, or last player with GP cards | same |

Trait bonuses exist for 13 figures (Belisarius, Imhotep, Lu Yu, Andrew
Mellon, Pericles, Aspasia, Enkidu, Lancelot, Marie Antoinette, Mani, Brahms,
Eisenstein, Gregory Peck). Only Pericles matches its card text. The full list
with magnitudes is in `tools/fight-studio/src/lib/engineTraits.ts` and on the
Great People tab of the tool.

## 3. Findings

1. **Three survival rules exist.** Doc and mobile dialogs: stat total below 10 dies. Engine: below 5. Hazard: doc and mobile say all-stat total below 100; engine says minimum per-stat total below 5.
2. **No achievement is evaluated as written.** Every achievement is "kill a worthy enemy GP in your mapped stat". Defensive, positional and cooperative achievements are impossible; 33 cards cannot earn a point at all.
3. **Only 13 of 80 traits have an effect**, 12 of them different from the card text.
4. **Archiving does not exist.** Claiming an achievement draws a new GP at once and the card stays on the board. Turing, Bi Sheng and Gutenberg traits depend on archiving.
5. **Visibility rules are unenforced.** Private cards can attack and are counted; only the two cards in an attack are revealed, not every card at the location.
6. **Ending a scenario ignores identity.** Any allied GP at the location can end any local scenario.
7. **Starting an event does not require presence.** The engine lets a player start an event at any location.
8. **Kill choice is the attacker's**, applied to whichever side loses, so a losing attacker can be killed by its own choice.
9. **Two battle designs are documented**: the board game (`fight.md`, web client) and the older round game (`great-people-card.md`, server).
10. **Stat scale is ambiguous**: cards 1–12, demo cards 1–24, some trait and achievement texts assume 25.
11. **Balance**: mean stat 5.7; 76 of 80 GPs alone fail a survival in some stat and 76 die alone to a hazard. Followers are near-essential under the engine's thresholds.

## 4. Keeping this current

- Change rules or stats through Fight Studio (`cd tools/fight-studio && npm run dev`, then http://127.0.0.1:3777). It writes `data/*.json` and `docs/*` directly, preserving formatting.
- When `BattlePage.tsx` changes, update `tools/fight-studio/src/lib/engineTraits.ts` (constants, implemented traits, achievement map) and `engine.ts` (formulas), then revisit the affected rows in `fight_rules.json`.
- After editing `data/*.json`, commit normally; the pre-commit hook runs `scripts/sync-assets.sh` to refresh the platform copies.

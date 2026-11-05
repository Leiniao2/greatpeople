# Fight knowledge audit

An inventory of everything in this repo that defines how battles ("fights")
work, what the shipped web engine actually does, and where the two disagree.
Maintained with the internal **Fight Studio** tool in
[`tools/fight-studio/`](../tools/fight-studio/README.md); the row-level
record lives in [`fight_rules.json`](fight_rules.json).

Audited 2026-10-29 against `web/src/battle/engine.ts`; updated 2026-11-04 for the real-history timeline, legacies and city states.

## 1. Where fight knowledge lives

| Kind | File | What it holds |
|---|---|---|
| doc | [`fight.md`](fight.md) | The board-game rulebook: setup, turn actions A–K, real history (§9), legacies (§10), public/private cards, 8 stats × 3 scenarios, natural hazards, archiving, turn order, end of game. |
| doc | [`great-people-card.md`](great-people-card.md) | Card attributes (7 eras, 32 identities, 8 stats, trait, achievement), follower and location attributes, building lists per era. Also an **older** 10-card, 3-stat round game under "Battle System". |
| doc | [`great-people-trait-idea.md`](great-people-trait-idea.md) | 28 draft traits and achievements; several blank or differing from `cards.json`. |
| doc | [`era.md`](era.md) | Era year ranges. |
| doc | [`fight_rules.json`](fight_rules.json) | Rules registry: one row per rule with doc text, engine behaviour, status, notes. |
| data | `data/cards.json` | 80 Great People: stats on a 1–12 scale, identities, era, gender, life years, trait text, legacy (unlock + effect), achievement text. Source of truth, synced to web/iOS/Android. |
| data | `data/demo_cards.json` | Same 80 figures on a 1–24 scale (collection demos, not battle). |
| data | `data/followers.json` | 32 follower templates: identity → stat, bonus 2. |
| data | `data/location_cards.json` | 142 location cards: buildings, capacity, per-stat bonuses, trait text (web only). |
| data | `data/locations.json` | 140 locations drawn for the board. |
| code | `web/src/battle/engine.ts` | The only battle engine: decks, reducer (deploy, move, attack, events, legacies, retirement, succession), timeline and time skips, city states, legacy effects, trait bonuses, scripted lesson boards. |
| code | `web/src/battle/BattleGame.tsx` | The board UI and CPU AI, shared by the Battle tab and the Epic fight lessons. |
| code | `web/src/battle/lessons.ts` | The fight-lesson curriculum (seven tiers), goals and coach. |
| code | `web/src/types/index.ts` | Battle state types. |
| code | `service/api/battle.py`, `service/models/battle.py` | Legacy server match: one stat per round, first to 5. Not the board game. |
| text | `ios/.../Battle/BattleView.swift`, `android/.../BattleScreen.kt` | Rules summary dialogs only (survival < 10, hazard < 100). No engine. |

## 2. What the engine implements

Constants (all hard-coded in `engine.ts`):

| Rule | Engine | `fight.md` |
|---|---|---|
| Locations per game | 7 | not stated |
| Starting hand | 3 GP (the earliest-born from the opening year; fewer in small eras), 2 events, 8 followers | same |
| Follower deck | 3 × 32 = 96 | not stated |
| Follower bonus | 2, or 3 when an allied GP at the location has the follower's identity | "any follower bonus" |
| Location bonus | per-stat bonus from `location_cards.json`, added to every GP in conflicts only | not in doc |
| Local survival | player's stat total at the location ≥ 5 survives | below 10 dies |
| Natural hazard | minimum over the 8 per-stat totals ≥ 5 survives; arrives as a city state (below); 1 round; hazard-shield legacies make a player immune | all-stat total below 100 dies |
| Global competition | sum of public GP base stats only; 1 round; reward 2 events / 4 followers / 1 GP | all public cards; same rewards |
| Legacy unlock | 1 "tick" when the GP kills an enemy GP (≥ 5 in the unlock stat) in a local event of its `legacy.unlock.stat`; claim at `unlock.wins` ticks (1 for every card) for +1 point and the legacy | achievement text per card |
| Winning | no points race: at 2030, or when no player has a Great Person now or to come, the most legacies wins (humans out of lineages watch the CPU play out history) | same |
| Time | 1 round = 1 year; opens on a real year; skips while no human GP is in their career | same (§9) |
| Lives | born, died (null = living), careerAge (default 18) per card; death of old age; successor born later (3 nearest offered) | same (§9) |
| Retirement | RETIRE_GP; successor at the real death year | same (§9) |
| Legacy slots | 2 in effect, one switch per turn; 7 effect kinds applied from data | same (§10) |
| City states | 30 % per empty city per year: local event (3 y), survival (2 y) or hazard (1 y) | same (§5) |

Trait bonuses exist for 13 figures (Belisarius, Imhotep, Lu Yu, Andrew
Mellon, Pericles, Aspasia, Enkidu, Lancelot, Marie Antoinette, Mani, Brahms,
Eisenstein, Gregory Peck). Only Pericles matches its card text. The full list
with magnitudes is in `tools/fight-studio/src/lib/engineTraits.ts` and on the
Great People tab of the tool.

## 3. Findings

0. **Real history (2026-11-04).** Fights now run on a timeline: one round per year, births, careers, deaths, successors born later, retirement and time skips; achievements unlock legacies (2 slots) and the most legacies at the end of history wins; cities fall into random states (30 %). All of it is in `fight.md` §9–10, the registry (Timeline, Legacy, City states rows) and `web/src/test/battle_timeline.test.ts`. Simulated naive games last about 245 played years from the Ancient opening down to about 26 from the Information opening, and most end when lineages run out of later-born successors; see the Balance tab's Timeline section.
1. **Three survival rules exist.** Doc and mobile dialogs: stat total below 10 dies. Engine: below 5. Hazard: doc and mobile say all-stat total below 100; engine says minimum per-stat total below 5.
2. **No achievement text is evaluated as written.** Every legacy unlocks on "kill a worthy enemy GP in the unlock stat" (now set for all 80 cards, so none is unreachable any more). Defensive, positional and cooperative achievements are impossible; 33 cards cannot earn a point at all.
3. **Only 13 of 80 traits have an effect**, 12 of them different from the card text.
4. **Archiving is replaced by succession.** Claiming a legacy no longer draws a GP on the timeline (the Epic lessons still do); new Great People only arrive as successors. Turing, Bi Sheng and Gutenberg traits depend on archiving.
5. **Visibility rules are unenforced.** Private cards can attack and are counted; only the two cards in an attack are revealed, not every card at the location.
6. **Ending a scenario ignores identity.** Any allied GP at the location can end any local scenario.
7. **Starting an event does not require presence.** The engine lets a player start an event at any location.
8. **Kill choice is the attacker's**, applied to whichever side loses, so a losing attacker can be killed by its own choice.
9. **Two battle designs are documented**: the board game (`fight.md`, web client) and the older round game (`great-people-card.md`, server).
10. **Stat scale is ambiguous**: cards 1–12, demo cards 1–24, some trait and achievement texts assume 25.
11. **Balance**: mean stat 5.7; 76 of 80 GPs alone fail a survival in some stat and 76 die alone to a hazard. Followers are near-essential under the engine's thresholds.

## 4. Keeping this current

- Change rules or stats through Fight Studio (`cd tools/fight-studio && npm run dev`, then http://127.0.0.1:3777). It writes `data/*.json` and `docs/*` directly, preserving formatting, and syncs data files to the platforms on save so the web dev server picks them up.
- Rule-text, rulebook and trait/achievement edits are handed to Claude Code (headless) on **Save all & update engine**: it edits `engine.ts`, keeps the tool's engine mirrors (`engineTraits.ts`, `engine.ts`) in step, updates the affected `fight_rules.json` rows and typechecks. Review the diff on the Engine sync tab, test on port 3001, then commit. See `tools/fight-studio/README.md`.
- Life years (`born`, `died`, `careerAge`) and legacies (`legacy.unlock`, `legacy.effect`) are data: edit them on the Great People tab; the engine reads them directly.
- When `engine.ts` is changed by hand, update `tools/fight-studio/src/lib/engineTraits.ts` (constants, implemented traits) and `engine.ts` (formulas, legacy text), then revisit the affected rows in `fight_rules.json`.
- After editing `data/*.json`, commit normally; the pre-commit hook runs `scripts/sync-assets.sh` to refresh the platform copies.

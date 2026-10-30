# Fight Studio (internal only)

A localhost-only tool to audit, edit and balance the battle ("fight")
knowledge in this repo: the rulebook, Great People stats / traits /
achievements, followers, location cards, and what the web battle engine
actually implements. It also runs balance analytics and a conflict simulator.

**Never deploy this.** It binds to 127.0.0.1, refuses non-loopback callers,
has no `build` script and no deploy config, and writes directly to the repo's
`data/` and `docs/` files. It is not part of the web app bundle.

## Run

```bash
cd tools/fight-studio
npm install
npm run dev          # http://127.0.0.1:3777
```

Desktop browsers only; there is no mobile layout. `npm run typecheck` runs
`tsc`.

## Tabs

| Tab | Purpose | Reads | Writes |
|---|---|---|---|
| Overview | Source inventory, headline findings, engine constants, git status of `data/` and `docs/` | everything | – |
| Rules registry | One row per rule: doc text vs engine behaviour, status (implemented / partial / conflict / missing / unspecified), notes. Add, edit, delete rows. | `docs/fight_rules.json` | same |
| Docs | Markdown editor with preview for the three design docs | `docs/fight.md`, `docs/great-people-trait-idea.md`, `docs/great-people-card.md` | same |
| Great People | Sortable, filterable table; edit stats, identities, era, gender, trait and achievement in place. Detail panel compares card text, engine behaviour and the idea doc. | `data/cards.json` | same |
| Followers | Edit stat and bonus; identity coverage (how many GPs unlock the +3 identity bonus) | `data/followers.json` | same |
| Locations | Edit per-stat bonuses, capacity and trait text; bonus heatmap by era; flags cards not in `locations.json` | `data/location_cards.json`, `data/locations.json` | `location_cards.json` |
| Balance | Stat histograms, power ranking, top-10 concentration, era / gender / identity heatmaps, survival and hazard risk with adjustable thresholds, achievement reachability, trait impact, and an "effect of unsaved edits" table | current in-memory data | – |
| Simulator | Two sides (GPs + followers) at one location; per-stat conflict totals with trait / location / follower breakdown, survival and hazard outcomes | current in-memory data | – |
| Engine sync | Jobs that hand rule/trait changes to Claude Code to update the engine; live log, summary, diff, typecheck, revert; ad-hoc instructions | `/api/jobs` | engine files (via the agent) |

Edits are held in memory until you press **Save** on the tab or **Save all
changes** in the top bar; **Revert** discards them. Unsaved tabs show a dot.
Balance and Simulator always use the unsaved state, so you can test a change
before writing it.

## Saving, syncing and engine sync

Saves rewrite the file exactly as the repo stores it (2-space JSON, the
file's own trailing-newline convention), so a save never produces a
formatting-only diff.

**Data edits reach the game immediately.** Saving any `data/*.json` file
runs `scripts/sync-assets.sh`, so `web/src/data/*.json` (and the iOS/Android
copies) update and the web dev server on port 3001 hot-reloads. Production
still needs a deploy.

**Rule and text edits reach the engine through Claude Code.** The engine is
code (`web/src/pages/BattlePage.tsx`), so a change to a rules-registry row,
to `docs/fight.md`, or to a card's trait/achievement text cannot be applied
by copying a file. When **Save all & update engine** is pressed with *engine
sync* on (top bar, default on), the tool:

1. saves every dirty file;
2. builds a change report from the before/after contents
   (`src/lib/changes.ts`): rule rows field by field, a line diff of the docs,
   trait/achievement text old → new, plus a data-only section for reference;
3. starts `claude -p` headless in the repo root (`server/api.ts`, `startJob`)
   with that report and a fixed guide. The agent may Read/Edit/Write, run
   `npx tsc`, `npx vitest` and read-only git commands, nothing else
   (`--allowedTools`, `--permission-mode acceptEdits`). It is told to update
   `BattlePage.tsx`, keep `src/lib/engineTraits.ts` / `engine.ts` in step,
   update the affected `fight_rules.json` rows, typecheck, and never commit;
4. streams the agent's log to the **Engine sync** tab, then lists the files
   the agent wrote (only those: files another session changes meanwhile are
   never counted), shows the diff and typecheck results, and offers
   **Revert**, which restores the agent-written files (and leaves any file
   that already carried other uncommitted edits alone).

The agent runs with the user's own Claude Code login; each job costs a few
tens of cents to a few dollars depending on the change. Jobs live in server
memory until the dev server restarts. Review the diff, run the game on
port 3001, then commit as usual.

The **Engine sync** tab can also run an ad-hoc instruction ("implement
Gandhi's Mahatma trait…") with or without the pending change report.

## How it works

```
tools/fight-studio/
├── vite.config.ts        dev server on 127.0.0.1:3777; publicDir = web/public (artwork)
├── server/api.ts         Vite middleware: GET /api/files, PUT /api/file/<key>,
│                         POST /api/sync, GET /api/git-status; loopback-only;
│                         allow-list of repo paths (FILES)
└── src/
    ├── lib/store.tsx     loads all files, tracks dirty state, save / revert / sync
    ├── lib/engine.ts     port of the engine's scoring formulas + analytics
    ├── lib/engineTraits.ts  hand-extracted engine facts: constants, the 13
    │                     implemented traits, ACHIEVEMENT_SPECS, source inventory
    ├── lib/markdown.ts   tiny Markdown renderer + trait-idea doc parser
    ├── charts/           inline-SVG bars, columns, heatmap, dot strip
    └── pages/            one component per tab
```

### Keeping the engine facts current

`engine.ts` and `engineTraits.ts` are ported by hand from
`web/src/pages/BattlePage.tsx` (`traitBonusForGP`, `computeLocationTotal`,
`computeEventSide`, the `natural_hazard` branch, `ACHIEVEMENT_SPECS`, and the
constants). When the engine changes:

1. Update the constants and trait entries in `engineTraits.ts` (each entry
   records what the code does and whether it matches the card text).
2. Update the formulas in `engine.ts` if scoring changed.
3. Revisit the affected rows in `docs/fight_rules.json`; each row's
   `codeSource` names the function to check.

### Adding a file to the tool

Add it to `FILES` in `server/api.ts`, to `FileKey` / `FileContents` in
`src/types.ts`, and to `KEYS` in `src/lib/store.tsx`. Only allow-listed paths
can be read or written.

## Security notes

- The API checks `req.socket.remoteAddress` against 127.0.0.1 / ::1 and
  returns 403 otherwise; Vite is also told to bind only to 127.0.0.1.
- There is no authentication because there is no network exposure. Do not
  add `--host` or a reverse proxy in front of it.
- It can run `scripts/sync-assets.sh` (POST /api/sync) and start headless
  Claude Code jobs (POST /api/apply) with a restricted tool allow-list; the
  jobs run as the local user in the repo root. Nothing is reachable from
  other machines.

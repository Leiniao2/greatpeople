# Great People

A collectible card game where players earn cards of legendary historical figures through mini-games and quizzes, then battle other players online.

## Repository Layout

| Directory | Contents |
|---|---|
| [`android/`](android/) | Android app (Kotlin / Jetpack Compose) |
| [`data/`](data/) | Shared card and location JSON — source of truth |
| [`ios/`](ios/) | iOS app (Swift / SwiftUI) |
| [`service/`](service/) | Backend service (REST API + WebSocket server) |
| [`web/`](web/) | Web frontend |
| [`docs/`](docs/) | Design docs and specifications |

## Setup

Enable the repo's git hooks once per clone, so shared assets stay in step:

```bash
git config core.hooksPath .githooks
```

Edit shared JSON in [`data/`](data/) only. The pre-commit hook copies it into
`web/`, `ios/` and `android/` via [`scripts/sync-assets.sh`](scripts/sync-assets.sh)
and stages the copies; run that script directly to sync without committing.

Artwork originals live in [`data/images/`](data/images/) as full-size JPEGs.
The platforms ship WebP copies produced by
[`scripts/build-images.mjs`](scripts/build-images.mjs); after adding or
replacing an original, run `npm run images` in `web/` (add `-- --clean` to
drop stale files) and commit the generated `.webp` files alongside it.

## Native apps and the web play routes

The iOS and Android apps keep their own Epic list, Collection, Fight and
Profile screens, but every story and Arcade challenge is played in the web
app, opened full screen in a WebView at `/play/story/<slug>` or
`/play/challenge/<id>` with `?embed=1` and the session token in the URL
fragment. The page reports `storyComplete`, `challengeComplete` and `close`
through the `gp` bridge (`web/src/bridge/native.ts`).

Both apps default to the production host. For local development:

- iOS: set the `GP_WEB_BASE_URL` / `GP_API_BASE_URL` environment variables on
  the Debug scheme (e.g. `http://localhost:3001` and `http://localhost:8080`),
  or edit `GPWebBaseURL` / `GPAPIBaseURL` in `Info.plist`.
- Android: debug builds already point at `http://10.0.2.2:3001` and
  `http://10.0.2.2:8080` (the emulator's view of the host); see
  `buildTypes` in `android/app/build.gradle.kts`.

## Documentation

- [Great People Card — Game Design & System Overview](docs/great-people-card.md)
- [Battle rulebook](docs/fight.md)
- [Fight knowledge audit](docs/fight-audit.md) — what the docs say vs what the web engine does, with the row-level [rules registry](docs/fight_rules.json)

## Internal tools

- [`tools/fight-studio/`](tools/fight-studio/) — localhost-only audit/editing tool for
  the battle rules, GP stats/traits/achievements, followers and location cards, with
  balance analytics and a conflict simulator. `cd tools/fight-studio && npm install && npm run dev`
  (http://127.0.0.1:3777). Never deploy it.

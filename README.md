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

## Documentation

- [Great People Card — Game Design & System Overview](docs/great-people-card.md)

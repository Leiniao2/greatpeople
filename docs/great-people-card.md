# Great People Card — Game Design & System Overview

## Concept

Great People Card is a collectible card game where players earn cards representing legendary historical and cultural figures by completing mini-games and quizzes. Players then use their collected cards to battle other players in real-time or asynchronous matches.

---

## Card Collection

### Earning Cards

Cards are acquired through two mechanics:

**Mini-Games**  
Short skill-based challenges (memory matching, reaction tests, word puzzles) tied to a figure's domain (e.g., a science figure's card unlocks after a physics puzzle). Completing a mini-game grants a card with a quality tier based on score.

**Quizzes**  
Multiple-choice and short-answer questions about the featured figure's life, works, and legacy. A passing score unlocks the card; a perfect score unlocks a foil/premium variant.

### Card Anatomy

| Field | Description |
|---|---|
| Figure | Name and portrait of the historical/cultural person |
| Era | Time period (Ancient, Medieval, Renaissance, Modern, Contemporary) |
| Domain | Science, Arts, Politics, Philosophy, Sports, etc. |
| Stats | Three numeric attributes used in battle (e.g., Influence, Innovation, Legacy) |
| Tier | Common / Rare / Epic / Legendary — determined by quiz/game performance |
| Lore | A short biographical quote or fact |

### Card Profile Synchronization

A player's full card collection (inventory) is stored server-side and synced to all their devices on login. Sync is optimistic: local changes are queued and flushed to the service when connectivity is restored.

---

## Battle System

### Match Types

| Type | Description |
|---|---|
| Online PvP | Real-time 1v1 match against another online player |
| Async PvP | Turn-based match; each player has up to 24 hours per turn |
| AI Practice | Match against a CPU opponent using a predefined deck |

### Deck Building

Players assemble a deck of 10 cards before a match. Deck composition rules:
- Maximum 2 Legendary cards
- All cards must be owned (synced from server)

### Battle Flow

1. Both players reveal their deck size (not contents) and confirm ready.
2. Each round, both players simultaneously choose one card to play.
3. The card with the highest combined stat total for the round's active domain wins the round.
4. First player to win 5 rounds wins the match.
5. Match result is reported to the service, which updates rankings and grants any earned rewards.

### Stat Resolution

Each round, one of the three stats (Influence, Innovation, Legacy) is randomly designated as the "active stat." Players know the active stat before choosing their card.

---

## Service API

The backend service exposes a REST/JSON API supporting the following capabilities:

### Authentication

| Endpoint | Description |
|---|---|
| `POST /auth/register` | Create a new account (email + password, or OAuth) |
| `POST /auth/login` | Authenticate and receive a session token |
| `POST /auth/logout` | Invalidate the current session token |
| `POST /auth/refresh` | Exchange a refresh token for a new access token |

### Card Profile

| Endpoint | Description |
|---|---|
| `GET /profile/cards` | Fetch the authenticated player's full card collection |
| `POST /profile/cards/sync` | Push locally earned cards to the server (deduplication enforced) |
| `GET /profile/cards/{cardId}` | Fetch a single card's metadata |

### Battle

| Endpoint | Description |
|---|---|
| `POST /battle/match` | Request matchmaking (returns match ID when opponent found) |
| `GET /battle/match/{matchId}` | Poll match state (used for async PvP) |
| `POST /battle/match/{matchId}/move` | Submit a card play for the current round |
| `POST /battle/match/{matchId}/forfeit` | Concede the match |
| `GET /leaderboard` | Fetch global or friends ranking |

Real-time PvP uses a WebSocket connection established after a match is found.

---

## Sub-Project Layout

```
greatpeople/
├── android/          # Android app (Kotlin / Jetpack Compose)
├── ios/              # iOS app (Swift / SwiftUI)
├── service/          # Backend service (REST API + WebSocket)
├── web/              # Web frontend (browser-based client)
└── docs/             # Design docs and specs (this directory)
```

---

## Platform Notes

### Android (`android/`)
- Kotlin with Jetpack Compose for UI
- Retrofit for HTTP; OkHttp WebSocket for real-time battle
- Room database for offline card cache
- Targets Android 8.0+ (API 26)

### iOS (`ios/`)
- Swift with SwiftUI
- URLSession for HTTP; URLSessionWebSocketTask for real-time battle
- Core Data for offline card cache
- Targets iOS 16+

### Service (`service/`)
- Stateless REST API with JWT authentication
- WebSocket server for real-time PvP sessions
- Persistent store for user accounts, card collections, match history, and rankings

### Web Frontend (`web/`)
- Browser-based client providing the same feature set as the mobile apps
- WebSocket support for real-time battle
- Responsive layout supporting desktop and mobile browsers

---

## Data Flow: Card Sync

```
Client (offline play)
  └─ earns card via mini-game or quiz
  └─ stores card in local cache

On connectivity / login
  └─ POST /profile/cards/sync  { cards: [...newly earned cards] }
  └─ Service deduplicates, persists, returns authoritative collection
  └─ Client overwrites local cache with server response
```

## Data Flow: Online Battle

```
Client A                      Service                      Client B
  │── POST /battle/match ──────▶│◀──── POST /battle/match ──│
  │◀── { matchId, wsUrl } ──────│───── { matchId, wsUrl } ──▶│
  │── WS connect ───────────────▶│◀─────────── WS connect ───│
  │── play card (round 1) ───────▶│◀──────── play card ───────│
  │          │    Service resolves round, broadcasts result    │
  │◀─────────────── round result ─────────────────────────────▶│
  │                    ... repeat for each round ...           │
  │◀─────────────── match result ─────────────────────────────▶│
```

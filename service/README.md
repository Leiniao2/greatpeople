# Service

Backend for Great People Card.

## Responsibilities

- User accounts: register, login, logout, token refresh (JWT)
- Card profile: persistent storage and sync across devices
- Battle: matchmaking, real-time WebSocket sessions, async turn management
- Leaderboard and ranking

## API Summary

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh` |
| Cards | `GET /profile/cards`, `POST /profile/cards/sync`, `GET /profile/cards/{id}` |
| Battle | `POST /battle/match`, `GET /battle/match/{id}`, `POST /battle/match/{id}/move`, `/forfeit` |
| Rankings | `GET /leaderboard` |

Real-time battle uses a WebSocket connection established after matchmaking completes.

See [`docs/great-people-card.md`](../docs/great-people-card.md) for the full design spec.

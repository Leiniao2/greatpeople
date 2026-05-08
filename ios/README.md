# iOS App

iOS client for Great People Card.

**Language:** Swift  
**UI:** SwiftUI  
**Min OS:** iOS 16

## Prerequisites

Install [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
```

## Setup

```bash
cd ios
xcodegen generate        # creates GreatPeople.xcodeproj
open GreatPeople.xcodeproj
```

The `.xcodeproj` is git-ignored — regenerate it any time with `xcodegen generate`.

## Features

- User registration, login, and logout
- Mini-games and quizzes to earn cards
- Card collection with server sync
- Real-time and async PvP battle

## Configuration

Before running, replace `YOUR_SERVICE_URL` in `GreatPeople/Services/APIClient.swift` and `WebSocketClient.swift` with the deployed service URL.

## Key Dependencies (via URLSession — no external packages)

- URLSession — REST API
- URLSessionWebSocketTask — real-time battle WebSocket
- SwiftUI — all UI

See [`docs/great-people-card.md`](../docs/great-people-card.md) for the full design spec.

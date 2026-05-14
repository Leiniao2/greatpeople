#!/usr/bin/env bash
# Copies shared JSON assets from web/src/data/ to iOS and Android resource dirs.
# Run manually or invoked automatically by the pre-commit hook.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/web/src/data"
IOS="$ROOT/ios/GreatPeople/Resources"
AND="$ROOT/android/app/src/main/assets"

FILES=(
  demo_cards.json
  followers.json
  locations.json
  story_challenges.json
  story_configs.json
)

for f in "${FILES[@]}"; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$IOS/$f"
    cp "$SRC/$f" "$AND/$f"
    echo "  synced $f"
  fi
done

echo "Sync complete."

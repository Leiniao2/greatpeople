#!/usr/bin/env bash
# Sync shared JSON assets from data/ (source of truth) to web, iOS and Android.
#
# Run manually, or automatically by the pre-commit hook in .githooks/.
# Pass --stage to git-add the copies (what the hook does) so a commit never
# lands with the platforms out of sync with data/.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/data"
WEB="$ROOT/web/src/data"
IOS="$ROOT/ios/GreatPeople/Resources"
AND="$ROOT/android/app/src/main/assets"

stage=0
[ "${1:-}" = "--stage" ] && stage=1

# Consumed by all three platforms.
SHARED=(
  cards.json
  demo_cards.json
  followers.json
  location_image_fallbacks.json
  locations.json
  story_challenges.json
  story_configs.json
)

# Web-only: no mobile loader yet.
WEB_ONLY=(
  location_cards.json
)

missing=()
copied=0

for f in "${SHARED[@]}"; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$WEB/$f"
    cp "$SRC/$f" "$IOS/$f"
    cp "$SRC/$f" "$AND/$f"
    [ $stage -eq 1 ] && git -C "$ROOT" add "$WEB/$f" "$IOS/$f" "$AND/$f"
    copied=$((copied + 1))
  else
    missing+=("$f")
  fi
done

for f in "${WEB_ONLY[@]}"; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$WEB/$f"
    [ $stage -eq 1 ] && git -C "$ROOT" add "$WEB/$f"
    copied=$((copied + 1))
  else
    missing+=("$f")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "sync-assets: not found in data/, skipped: ${missing[*]}" >&2
fi

echo "sync-assets: synced $copied file(s) from data/"

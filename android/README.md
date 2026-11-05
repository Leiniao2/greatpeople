# Android App

Android client for Great People Card.

**Language:** Kotlin  
**UI:** Jetpack Compose  
**Min SDK:** API 26 (Android 8.0)

## Key Dependencies

- Retrofit + OkHttp — REST API and WebSocket
- Room — offline card cache
- Hilt — dependency injection

## Features

- User registration, login, and logout
- Mini-games and quizzes to earn cards
- Card collection with server sync
- Real-time and async PvP battle

See [`docs/great-people-card.md`](../docs/great-people-card.md) for the full design spec.

## Installing on a phone

`./gradlew installDevice` builds the `device` variant (package `com.greatpeople.card.device`),
which talks to the live Cloud Run site.

Google sign-in only accepts builds whose signing key's SHA-1 is registered on the
project's Android OAuth client, so every machine must sign the `device` build with the
same shared key. That key is kept out of this public repo. To set up a machine:

1. Copy `greatpeople-device.keystore` from a machine that already has it into `~/.android/`.
2. Add to `~/.gradle/gradle.properties`:

   ```
   GP_DEVICE_KEYSTORE=/Users/<you>/.android/greatpeople-device.keystore
   GP_DEVICE_KEYSTORE_PASSWORD=android
   GP_DEVICE_KEY_ALIAS=androiddebugkey
   GP_DEVICE_KEY_PASSWORD=android
   ```

Registered SHA-1: `FA:D7:B7:32:2C:A0:24:57:D7:3A:D4:48:B0:0E:75:BE:C8:77:DB:3C`.
Without the key the build still works but warns, and Google sign-in fails with code 10
(`DEVELOPER_ERROR`). Installing over a copy signed with a different key fails with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`; uninstall it first.

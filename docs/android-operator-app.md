# Android Operator App

The Android app is a Capacitor wrapper around the local operator dashboard.

## Current APK

Debug APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

This debug build is suitable for installing on the owner's Android phone for testing.

## Install With USB Debugging

1. Enable Developer Options on the Android phone.
2. Enable USB debugging.
3. Connect the phone to this Mac.
4. Trust the computer on the phone.
5. Run:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Rebuild

Use JDK 21:

```sh
JAVA_HOME=/Users/admin/Library/Java/JavaVirtualMachines/ms-21.0.10/Contents/Home npm run android:sync
cd android
JAVA_HOME=/Users/admin/Library/Java/JavaVirtualMachines/ms-21.0.10/Contents/Home ./gradlew assembleDebug
```

## Data Flow

- Website sends each booking to the Google Apps Script endpoint.
- Apps Script sends the email notification to `info@arides.ee`.
- Apps Script also stores the order in Google Sheet `ARIDES Cargo Orders`.
- Android operator app loads orders with `action=orders`.
- Busy slots are saved with `action=busySlot`.
- Public website reads busy slots with `action=busy`.

## Next Native Phase

The current APK is a WebView wrapper. For GPS-aware scheduling, the next phase should add native location permission and route-time calculation with Google Maps or Mapbox.

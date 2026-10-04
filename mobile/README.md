# Pulse Flutter app

The active Android app is built with Flutter. Open this `mobile` folder in
Android Studio, then run `lib/main.dart` on an emulator or connected device.

This is an interactive offline preview: sample orders, shipment events, carriers,
and driver tasks are clearly labeled and never sent to a server. A release build
shows a configuration gate rather than demo data.

```powershell
flutter pub get
flutter run
flutter analyze
flutter test
flutter build apk --debug
```

See [ABOUT.md](./ABOUT.md) for the feature map, data boundary, and integration
work required before enabling live operations.

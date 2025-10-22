# OxSig Downloads

This directory contains desktop and mobile app installers.

## Structure

```
downloads/
├── windows/
│   └── oxsig-windows-latest.exe
├── macos/
│   ├── oxsig-macos-intel-latest.dmg
│   └── oxsig-macos-silicon-latest.dmg
├── android/
│   └── oxsig-android-latest.apk
└── README.md
```

## Building Desktop Apps

### Windows (using Tauri)
```bash
pnpm tauri build --target x86_64-pc-windows-msvc
```

### macOS (using Tauri)
```bash
# Intel
pnpm tauri build --target x86_64-apple-darwin

# Apple Silicon
pnpm tauri build --target aarch64-apple-darwin
```

### Android (using Capacitor)
```bash
npx cap add android
npx cap sync android
npx cap open android
# Build APK in Android Studio
```

## Distribution

- Hosted on GitHub Releases
- Available via direct download
- Auto-update supported via Tauri updater

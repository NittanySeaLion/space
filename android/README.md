# Lunar Sky — Android Screensaver (DreamService)

Packages the [Lunar Sky](https://space.litigatech.com) visualization as an Android
**DreamService** screensaver. It loads `space.litigatech.com/screensaver?loc=<location>`
in a full-screen WebView while your Samsung (or any Android) phone is charging.

> **What it looks like:** a live, real-time astronomical simulation of the lunar sky —
> stars, planets, the Sun, and Earth — rendered from a selectable lunar surface location.

---

## Build the APK

### Prerequisites

- [Android Studio](https://developer.android.com/studio) — or just the command-line
  [Android SDK / command-line tools](https://developer.android.com/studio#command-line-tools-only)
- Java 17+ in PATH

### Steps

```bash
cd android/LunarSkyDream

# Build a debug APK (no signing required for sideloading)
./gradlew assembleDebug
```

On Windows (Git Bash or PowerShell):

```bash
./gradlew.bat assembleDebug
```

The APK will be at:

```
app/build/outputs/apk/debug/app-debug.apk
```

---

## Install on Samsung S26 Ultra (Sideloading)

Samsung's Galaxy Themes Store no longer accepts live wallpaper submissions (closed 2023),
so the APK is distributed via sideloading.

### 1 — Enable Developer Options on the phone

1. Go to **Settings → About phone → Software information**
2. Tap **Build number** seven times
3. Go back to **Settings → Developer options**
4. Enable **USB debugging**

### 2 — Enable installing unknown apps (one-time)

1. **Settings → Apps → Special app access → Install unknown apps**
2. Find the app you'll use to open the APK (Files, Chrome, etc.) and enable **Allow from this source**

### 3 — Transfer the APK to the phone

**Option A — USB cable:**

```bash
# Install via ADB directly (requires USB debugging enabled)
adb install app/build/outputs/apk/debug/app-debug.apk
```

**Option B — Wireless:**

1. Copy `app-debug.apk` to your Google Drive, OneDrive, or email it to yourself
2. Open it on the phone — tap **Install** when prompted

### 4 — Activate the screensaver

1. **Settings → Display → Screen saver** (Samsung One UI calls this "Screen saver")
   - Some older One UI versions: **Settings → Display → Screensaver**
2. Tap the toggle to turn Screen saver **On**
3. In the list, select **Lunar Sky**
4. Tap the **gear icon ⚙** next to "Lunar Sky" to pick your lunar location:
   - **Mare Orientale** — dramatic western limb; Earth on the horizon
   - **Shackleton Crater** — south pole, Artemis III candidate; Earth skims the rim
   - **Tranquility Base** — Apollo 11 site; Earth permanently visible overhead

5. Scroll down and tap **Start now** to preview, or plug in to charge and let it trigger automatically.

### When does it activate?

Android's DreamService fires when **all three** conditions are met:

| Condition | Setting |
|-----------|---------|
| Charging (USB or wireless) | Always required |
| Screen times out | Set in **Settings → Display → Screen timeout** |
| Screen saver is enabled | **Settings → Display → Screen saver → On** |

To see it immediately: **Settings → Display → Screen saver → Start now**

---

## Project structure

```
android/LunarSkyDream/
├── build.gradle                         Project-level Gradle config
├── settings.gradle
└── app/
    ├── build.gradle                     App module (compileSdk 34, minSdk 21)
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/litigatech/lunarsky/
        │   ├── LunarSkyDreamService.kt  DreamService — loads WebView
        │   └── DreamSettingsActivity.kt Settings screen (location picker)
        └── res/
            ├── xml/dream_info.xml       Links settings gear icon to activity
            ├── layout/activity_dream_settings.xml
            └── values/strings.xml
```

---

## FAQ

**Does this drain the battery?**
The DreamService only runs while the phone is charging, so battery impact is minimal.
The WebView renders the canvas at ~30 fps; the S26 Ultra's display dims itself after
a few seconds per normal Always-On Display rules.

**Can I use it as a live wallpaper instead?**
Not with this build — DreamService is screensaver-only (charges + screen timeout).
A live wallpaper would require porting the JS renderer to a native `WallpaperService`,
which is significantly more work (see Issue #2, Approach B/C).

**The screensaver shows a blank screen.**
Ensure the phone has an internet connection. The visualization requires
`space.litigatech.com` to be reachable; it does not cache locally.

**3120×1440 (S26 Ultra) — does it look good?**
Yes. The canvas renderer calls `window.innerWidth/Height` and fills whatever pixel
resolution the WebView provides, so the full S26 Ultra panel resolution is used.

# Kyambogo Campus Map - Google Play Store & iOS App Packaging Guide

This application is built as a production-grade Progressive Web App (PWA) with Trusted Web Activity (TWA) compliance, ready to be packaged and published to the **Google Play Store** (as a `.aab` Android App Bundle) and the **Apple App Store** / **iOS Home Screen**.

---

## 🚀 Quick Summary of Included Mobile Assets

- **PWA Manifest:** `/manifest.webmanifest` with standalone mode, branding `#0bce3b`, shortcuts, and high-res icons.
- **Icons:** 
  - `pwa-192x192.png` (Android home screen icon)
  - `pwa-512x512.png` (High-resolution icon for Google Play Store)
  - `pwa-maskable-512x512.png` (Android adaptive maskable icon)
  - `apple-touch-icon.png` (iOS Safari home screen icon)
  - `icon.svg` (Scalable vector master asset)
- **Service Worker:** `/sw.js` with offline map tile caching and instant app loading.
- **Android TWA Configuration:** `twa-manifest.json` for Google's official Bubblewrap tool.
- **Digital Asset Links:** `/.well-known/assetlinks.json` for full-screen verification (no browser URL bar).
- **Capacitor Config:** `capacitor.config.json` for native Android Studio & iOS Xcode wrapping.

---

## 📱 Method 1: Easiest & Fastest — PWABuilder (Recommended for Play Store)

PWABuilder is Microsoft and Google's official open-source tool to package PWAs into Google Play Store `.aab` bundles and iOS packages in 2 minutes:

1. Open **[https://www.pwabuilder.com/](https://www.pwabuilder.com/)**.
2. Enter your live app URL:
   `https://ais-pre-sxqfrx55rwriyirynff3mq-517746140877.europe-west1.run.app`
3. Click **Start**. The tool will analyze the manifest, icons, and service worker (all will pass with a 100/100 PWA score).
4. Click **Package For Stores**:
   - Select **Android**: Click **Generate Package**.
     - Fill in your Package ID: `org.kyambogo.campusmap`
     - Choose **Generate digital asset links & signing key**.
     - Download the resulting `.zip` file containing your signed `.aab` (Android App Bundle).
   - Select **iOS**: Click **Generate Package** to download the ready Xcode project.
5. Upload the `.aab` directly to the [Google Play Console](https://play.google.com/console)!

---

## 🛠️ Method 2: Google's Official CLI — Bubblewrap (TWA)

Google's official CLI tool directly compiles an Android App Bundle (`.aab`):

```bash
# 1. Install Google Bubblewrap CLI
npm install -g @bubblewrap/cli

# 2. Initialize from your live Web Manifest
bubblewrap init --manifest="https://ais-pre-sxqfrx55rwriyirynff3mq-517746140877.europe-west1.run.app/manifest.webmanifest"

# 3. Build the signed Android App Bundle (.aab) and testing APK (.apk)
bubblewrap build
```

This generates:
- `app-release-bundle.aab` (Upload this file to Google Play Console).
- `app-release-signed.apk` (Install directly on any Android phone via USB/WhatsApp/Drive to test immediately).

---

## 🍎 iOS App Installation & App Store Packaging

### Instant Installation on iPhone/iPad (Zero App Store fees):
1. Open the application in **Safari** on iOS.
2. Tap the **Share** button (box with upward arrow) at the bottom toolbar.
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. The app installs with its custom Kyambogo app icon, launches in full screen without the browser bar, and runs offline!

### Packaging for Apple App Store (via Capacitor):
```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Kyambogo Campus Map" "org.kyambogo.campusmap"
npm run build
npx cap add ios
npx cap open ios  # Opens directly in Xcode for App Store submission
```

---

## 📋 Google Play Console Upload Checklist

When uploading `app-release-bundle.aab` to Google Play Console:

1. **Create an Application:**
   - App Name: `Kyambogo Digital Campus Map`
   - Default language: `English (United States)`
   - App or game: `App`
   - Free or paid: `Free`
2. **Store Listing Details:**
   - **Short description (80 chars):** Interactive Kyambogo University campus map, faculties, offices & live navigation.
   - **Full description:** Locate faculties, departments, lecture rooms, banks, cafeterias, and staff offices across Kyambogo University with walking directions, offline support, and GPS location tracking.
   - **App Icon:** Upload `public/pwa-512x512.png`.
   - **Feature Graphic:** 1024 x 500 banner highlighting the campus map.
   - **Category:** Education / Maps & Navigation.
3. **App Releases:**
   - Go to **Production** -> **Create new release**.
   - Upload your `app-release-bundle.aab`.
   - Review and rollout release!

# SANZAR

> **Learn Today, Lead Tomorrow.**  
> Built according to `SANZAR_Complete_Architecture_Report.md`.

## System Overview
- **Cloudflare Pages (`apps/web`)**: Unified React + TypeScript + Vite + Tailwind CSS frontend (`/` student learning & `/admin` dashboard).
- **Cloudflare Worker API (`apps/api`)**: High-performance backend routing with Cloudflare D1 database and Firebase JWT verification.
- **Native Android (`apps/android`)**: Offline-first Kotlin app with Jetpack Compose, Room database, DataStore, and WorkManager background sync.
- **Identity**: Firebase Authentication (Email/Password & Google Sign-In).

## Admin Bootstrap
- Configured admin email: `sayimarafat676@gmail.com`.
- Automatically provisioned as `super_admin` in D1 upon first authenticated token presentation.

## Local Development
- Web: `cd apps/web && npm install && npm run dev` (starts on port 5173)
- API: `cd apps/api && npm install && npm test`
- Android: Open `apps/android` in Android Studio or run Gradle build.

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

## Translation & Grammar Flow (no AI)

Every `POST /v1/translation` request runs through 3 layers, cheapest first:

1. **Static D1 dictionary** – single words and known phrases from `dictionary_entries`.
2. **Shared D1 `translation_cache`** – any sentence one student has already translated is served to everyone in under 10 ms. Hits are counted.
3. **External provider** – used only for sentences nobody has translated yet:
   - Google Translate v2, when `GOOGLE_TRANSLATE_API_KEY` is set and the month is still under the **480,000‑char safety cap** (stored in `translation_quota_monthly`; Google's free tier is 500K).
   - MyMemory as the free fallback when the cap is reached or Google fails.
   The result is saved back into the cache.

Grammar (`POST /v1/dictionary/insights`): curated `grammar_rules` (more specific patterns win) + built‑in Chinese/Bangla mistake checks + the free LanguageTool API for English (gives up silently after 2.5 s).

**Ops:** `GET /v1/admin/translation-quota` (teacher/admin only) returns this month's `charsUsed`, `charCap`, `charsRemaining`, `percentUsed` and cache `entries`/`totalHits`. To change the cap, edit `GOOGLE_TRANSLATE_MONTHLY_CHAR_CAP` in `apps/api/src/dictionary.js`.

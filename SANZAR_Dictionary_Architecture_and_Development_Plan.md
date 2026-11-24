# SANZAR Dictionary

## Unified Architecture and Development Plan

**Document status:** Consolidated implementation plan\
**Product:** SANZAR --- Web and Android language-learning platform\
**Scope:** Dictionary, online translation, offline translation, saved
vocabulary, translation history, and synchronization

------------------------------------------------------------------------

## 1. Executive summary

The SANZAR Dictionary should evolve from a searchable vocabulary list
into a **three-language dictionary and translator**. It will support
English, Bangla, and Simplified Chinese, including word, phrase, and
sentence translation in all six language directions.

The feature will retain the existing SANZAR infrastructure and extend
the current implementation rather than replacing it:

-   **Web:** React, TypeScript, and Vite
-   **Android:** Kotlin and Jetpack Compose
-   **Backend:** Cloudflare Pages and Cloudflare Workers
-   **Database:** Cloudflare D1
-   **Authentication:** Firebase Authentication; the Worker verifies
    Firebase ID tokens
-   **Web local storage:** IndexedDB
-   **Android local storage:** Room / SQLite

The design is hybrid: online services provide translation and account
synchronization; local databases preserve useful data and enable offline
access. Offline translation is available when a compatible model has
been installed. Translation models must not be bundled into the APK or
initial web bundle.

The system must keep four concepts separate:

1.  **Dictionary entries:** centrally curated vocabulary shared by
    users.
2.  **Translation history:** private translation activity belonging to
    one account.
3.  **Saved vocabulary:** a user's personal learning collection,
    synchronized across devices.
4.  **Translation cache:** temporary reusable results used to improve
    performance.

This separation is a core architectural requirement.

------------------------------------------------------------------------

## 2. Product definition

The section remains named **Dictionary**, but its primary interface
should behave like a translator.

### 2.1 Supported languages

  Language             Internal code   Display name
  -------------------- --------------- --------------
  English              `en`            English
  Bangla / Bengali     `bn`            বাংলা
  Simplified Chinese   `zh-Hans`       简体中文

The existing database uses `zh`. Preserve compatibility by mapping the
existing `zh` representation to `zh-Hans` at the API/client boundary
where appropriate. Do not perform a risky wholesale rename without a
migration and compatibility plan.

### 2.2 Supported translation directions

All six directions are required:

  Source               Target
  -------------------- --------------------
  English              Bangla
  English              Simplified Chinese
  Bangla               English
  Bangla               Simplified Chinese
  Simplified Chinese   English
  Simplified Chinese   Bangla

### 2.3 Translation behavior

The interface should support:

-   Automatic source-language detection.
-   Manual source-language selection or override.
-   User-selected target language.
-   Word, phrase, and sentence translation.
-   Online translation.
-   Offline translation when a compatible model is installed.
-   Copying and listening to text where platform speech services support
    it.
-   Saving useful words to the user's vocabulary collection.
-   Viewing and reopening previous translations.

Automatic detection should be treated as a best-effort result. The user
must be able to correct the detected source language.

### 2.4 Translation versus dictionary enrichment

These are related but distinct capabilities:

-   **Translation** converts user-entered text between languages. It
    must support sentences and phrases.
-   **Dictionary enrichment** provides structured information about a
    vocabulary item: definitions, pronunciation, part of speech, HSK
    level, and examples.

A translation result should not be presented as a fully curated
dictionary entry unless the corresponding entry exists in the SANZAR
dictionary data.

------------------------------------------------------------------------

## 3. Existing implementation baseline

The following describes the codebase audit supplied for this plan.

### 3.1 Existing database

Migration: `apps/api/migrations/0007_dictionary.sql`

The existing `dictionary_entries` table contains:

-   `id`
-   `language` (`zh` or `en` in the current implementation)
-   `word`
-   `phonetic`
-   `part_of_speech`
-   `meaning_en`
-   `meaning_bn`
-   `meaning_zh`
-   `example`
-   `example_translation`
-   `hsk_level`
-   `status` (`draft`, `published`, or `archived`)
-   `created_by`
-   `created_at`
-   `updated_at`

There is an index on `(language, word)`.

### 3.2 Existing API

In `apps/api/src/features.js`, the existing public endpoint is:

`GET /v1/dictionary?q=...&lang=...&limit=...`

Current behavior:

-   Returns published entries.
-   Default limit is 60.
-   Maximum limit is 100.
-   Searches `word`, `phonetic`, `meaning_en`, `meaning_bn`, and
    `meaning_zh` using substring matching.
-   Ranks exact word matches before prefix matches and other substring
    matches.
-   Uses alphabetical ordering as a secondary ordering.

Existing admin endpoints in `apps/api/src/admin.js`:

-   `GET /v1/admin/dictionary`
-   `PUT /v1/admin/dictionary/:id`
-   `DELETE /v1/admin/dictionary/:id`

### 3.3 Existing Web implementation

File: `apps/web/src/features/dictionary/DictionaryPage.tsx`

Current behavior includes:

-   Sign-in gate for guests.
-   Debounced search (approximately 260 ms).
-   Filters: All, Chinese, English, and Saved.
-   Browser speech synthesis for Chinese and English.
-   Saved entries stored in `localStorage` under `sanzar.dict.saved`.
-   Optional English definition fallback using `dictionaryapi.dev` for
    eligible English-only queries.
-   Dictionary cards showing word, phonetic form, language, part of
    speech, HSK level, meanings, and example information.

### 3.4 Existing Android implementation

File:
`apps/android/app/src/main/java/com/sanzar/app/ui/screens/DictionaryScreen.kt`

Current behavior includes:

-   Debounced search (approximately 250 ms).
-   Filters: All, Chinese, English, and Saved.
-   Word, phonetic form, HSK level, meanings, and example display.
-   Saved IDs held in screen memory, so they are not durable across
    screen recreation or app restart.

The Android implementation currently lacks several Web capabilities,
including pronunciation playback, part-of-speech display, language
badges, English fallback definitions, and a loading indicator.

### 3.5 Known gaps

-   Saved vocabulary is not reliably persistent or synchronized.
-   The Saved filter depends on the currently loaded result set, so
    saved entries outside the first page can be missed.
-   No pagination or load-more mechanism.
-   No HSK or part-of-speech filters.
-   No tone-insensitive Pinyin search.
-   No search-term highlighting.
-   Web and Android feature parity is incomplete.
-   No translation history.
-   No complete translation workflow for all six language directions.
-   No offline translation/model lifecycle.
-   No robust Admin bulk CSV/JSON import.
-   No detailed vocabulary view or direct Flashcards/Practice
    integration.

This plan addresses these gaps incrementally.

------------------------------------------------------------------------

## 4. Architecture and system boundaries

### 4.1 Keep the existing infrastructure

Do not replace the current SANZAR architecture for this feature.

``` text
                         SANZAR
                            |
             +--------------+--------------+
             |                             |
          Web app                       Android app
     React + TypeScript              Kotlin + Compose
             |                             |
      IndexedDB local DB                Room / SQLite
             |                             |
             +--------------+--------------+
                            |
                     Cloudflare Worker
                            |
             +--------------+--------------+
             |                             |
       Firebase Auth                  Cloudflare D1
     ID-token verification        Shared dictionary and
                                  user-specific account data
             |
      Translation provider
      adapter / online service
```

Cloudflare Pages hosts the Web application. Cloudflare Workers expose
the API. D1 stores shared dictionary records and synchronized account
data. Firebase Authentication remains the identity provider.

### 4.2 Authentication and authorization

-   The client obtains a Firebase ID token through Firebase
    Authentication.
-   The Worker verifies the token before processing authenticated
    requests.
-   The Worker derives the account UID from the verified token claims.
-   The client must never be trusted to submit an arbitrary `user_id`
    and have that value accepted as the owner of a record.
-   Every history and saved-vocabulary query must be scoped to the
    authenticated UID.
-   Public dictionary lookup may be available without sign-in.
-   Personal history, saved vocabulary synchronization, and other
    account-specific features require sign-in.

Do not introduce a second authentication provider or a separate JWT
authority for this feature.

### 4.3 Platform-specific local databases

  -----------------------------------------------------------------------
  Platform                Local database          Primary purpose
  ----------------------- ----------------------- -----------------------
  Web                     IndexedDB               Dictionary cache,
                                                  translation cache,
                                                  local history, saved
                                                  vocabulary, pending
                                                  sync

  Android                 Room / SQLite           Dictionary cache,
                                                  translation cache,
                                                  local history, saved
                                                  vocabulary, pending
                                                  sync
  -----------------------------------------------------------------------

The Web and Android local databases are separate implementations. They
synchronize through the Worker API and D1; they do not directly share a
local database.

------------------------------------------------------------------------

## 5. Data model and ownership

### 5.1 Shared dictionary entries

Keep `dictionary_entries` as the centrally curated vocabulary source.

The schema should be extended to support Bangla headwords if the product
requires searching and presenting Bangla as a source-language vocabulary
item. Preserve the existing meaning columns and existing `zh` records
during migration.

Important implementation considerations:

-   Support headword languages `en`, `bn`, and the existing Chinese
    representation.
-   Normalize language identifiers at the API boundary.
-   Preserve original display text and phonetic information.
-   Keep draft, published, and archived states.
-   Do not silently invent missing translations, pronunciations, or
    examples.
-   Validate the migration against existing records before deployment.

The current `example_translation` field is singular and does not
explicitly identify its target language. A future schema revision may
need structured multilingual example translations. Do not force a broad
redesign unless the current data and UI genuinely require it.

### 5.2 Translation history

Translation history is private user activity. It must synchronize with
the user's account and be available on that user's other devices.

Conceptual initial D1 schema:

``` sql
CREATE TABLE translation_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE INDEX idx_translation_history_user_time
ON translation_history(user_id, created_at DESC);
```

This is a starting point, not a complete final migration. The
implementation should also consider:

-   Stable client-generated IDs for offline creation and idempotent
    synchronization.
-   A sync/version field or equivalent conflict strategy.
-   Provider/model metadata where useful.
-   Input validation and sensible text-size limits.
-   Soft deletion through `deleted_at` or equivalent tombstones.
-   Stable ordering for pagination.

**Required behavior:**

1.  Save a user's explicit translation action locally first.
2.  Mark the record as pending synchronization.
3.  Synchronize it to D1 when connectivity is available.
4.  Retrieve history only for the authenticated account.
5.  Allow the same account to access its history on Web and Android.
6.  Do not expose one user's records to another user.
7.  Do not create a new history item merely because a cached result was
    displayed.
8.  Reopening an old history item must not create another history event.
9.  Deletions must synchronize so a deleted item does not reappear on
    another device.

### 5.3 Saved vocabulary

Saved vocabulary is a private learning collection, separate from
translation history and dictionary entries.

Conceptual initial schema:

``` sql
CREATE TABLE saved_vocabulary (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dictionary_entry_id TEXT,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    word TEXT NOT NULL,
    meaning TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE INDEX idx_saved_vocabulary_user
ON saved_vocabulary(user_id, created_at DESC);
```

The final schema should retain enough information to preserve a saved
item even if its original dictionary entry is later edited or archived.
It should support stable IDs, sync state/versioning, and soft deletion.

Requirements:

-   Saved vocabulary is namespaced by account.
-   Save/remove actions work offline and synchronize later.
-   A saved item remains available offline.
-   Saved vocabulary is not limited to the currently loaded dictionary
    search results.
-   Saved vocabulary should be usable by SANZAR Flashcards and Practice
    features.
-   Account switching must not reveal the previous account's saved
    items.

### 5.4 Translation cache

The translation cache is a performance mechanism, not a user history.

A cache key should account for:

-   Source language.
-   Target language.
-   Normalized input text.
-   Translation provider or model.
-   Provider/model version.

Prefer local caching on each platform. A shared server cache is optional
and should only be used for suitable, non-sensitive text. Do not
globally cache private or sensitive sentences without a deliberate
privacy and retention policy.

Cache hits must not automatically create history records.

### 5.5 Keep the four data classes separate

  -----------------------------------------------------------------------
  Data class        Owner             Synchronization   Main purpose
  ----------------- ----------------- ----------------- -----------------
  Dictionary        SANZAR            Shared backend    Curated
  entries                                               vocabulary

  Translation       Individual        Across that       Personal activity
  history           account           account's devices 

  Saved vocabulary  Individual        Across that       Personal learning
                    account           account's devices 

  Translation cache Local device by   Usually not       Performance and
                    default           synchronized      reuse
  -----------------------------------------------------------------------

Do not merge these tables or treat one as a substitute for another.

------------------------------------------------------------------------

## 6. API design

Retain existing endpoints where practical and extend them compatibly.

### 6.1 Dictionary endpoints

Retain:

`GET /v1/dictionary`

Extend query support to include:

-   `q`
-   `lang`
-   `limit`
-   `cursor`
-   `hsk_level`
-   `part_of_speech`

Admin-only status filtering may be supported separately.

Search should rank results in a predictable order:

1.  Exact headword match.
2.  Normalized exact match.
3.  Headword prefix match.
4.  Phonetic/Pinyin match.
5.  Meaning match.
6.  Other substring match.

Add Pinyin normalization so users can search without tone marks where
practical. Preserve the original Pinyin for display.

Pagination must be deterministic. If cursor pagination is implemented,
the cursor must encode enough ordering information to continue
consistently, including a stable tie-breaker such as entry ID. Search
ranking makes cursor design more complex; test that records are not
skipped or duplicated between pages.

### 6.2 Translation endpoints

Suggested endpoints:

  --------------------------------------------------------------------------
  Method                  Endpoint                   Purpose
  ----------------------- -------------------------- -----------------------
  `POST`                  `/v1/translation`          Translate text online

  `POST`                  `/v1/translation/detect`   Detect source language
                                                     when needed
  --------------------------------------------------------------------------

The translation service should validate the source/target pair and input
size. It should use a provider-independent adapter so the UI and
business logic are not tied to one vendor.

### 6.3 History endpoints

Suggested endpoints:

  ---------------------------------------------------------------------------------
  Method                  Endpoint                          Purpose
  ----------------------- --------------------------------- -----------------------
  `GET`                   `/v1/translation/history`         Retrieve the
                                                            authenticated user's
                                                            history

  `DELETE`                `/v1/translation/history/:id`     Delete one history
                                                            record

  `POST`                  `/v1/translation/history/batch`   Synchronize local
                                                            history changes
  ---------------------------------------------------------------------------------

History writes should be idempotent. A client-generated stable ID allows
retries without creating duplicate records.

The online translation endpoint and history synchronization should have
clearly defined responsibilities. Do not accidentally create duplicate
history when a translation request is retried or a cached result is
reopened.

### 6.4 Saved-vocabulary endpoints

Suggested endpoints:

  ----------------------------------------------------------------------------
  Method                  Endpoint                     Purpose
  ----------------------- ---------------------------- -----------------------
  `GET`                   `/v1/dictionary/saved`       Retrieve the
                                                       authenticated user's
                                                       saved items

  `POST`                  `/v1/dictionary/saved`       Create or update a
                                                       saved item

  `DELETE`                `/v1/dictionary/saved/:id`   Remove a saved item
  ----------------------------------------------------------------------------

All these endpoints must derive ownership from the verified Firebase
token.

### 6.5 Synchronization endpoint

A unified endpoint such as `POST /v1/sync` may be introduced when it
simplifies incremental synchronization across history and saved
vocabulary.

The sync protocol should provide:

-   Stable IDs.
-   Idempotent upserts.
-   Incremental changes rather than full downloads on every sync.
-   Tombstones for deletions.
-   Per-account ownership enforcement.
-   Conflict handling based on explicit timestamps or version fields.
-   Retry-safe behavior.
-   A way to track the last successful synchronization point.

Do not build a complex general-purpose synchronization framework before
the two personal data types need it. Start with a small, explicit
protocol.

------------------------------------------------------------------------

## 7. Translation service design

Use a provider-independent service layer.

``` text
TranslationService
├── RequestValidator
├── LanguageDetector
├── ProviderAdapter
│   ├── translate()
│   ├── detectLanguage()
│   └── getSupportedPairs()
├── TranslationCache
└── TranslationResultMapper
```

### 7.1 Online translation

The Worker calls the selected provider through an adapter. This isolates
provider-specific request formats, response formats, limits, and error
handling.

The implementation should support:

-   All six language directions.
-   Automatic detection where supported.
-   Manual source-language override.
-   Provider errors and rate limits.
-   Timeouts and retry policy.
-   Input validation.
-   Clear unsupported-pair errors.
-   Provider/model metadata for diagnostics where appropriate.

Keep provider credentials on the server. Do not expose secret API keys
in the Web or Android clients.

### 7.2 Offline translation

Offline inference should happen on the client device when a compatible
model is installed. Do not route offline translation through the Worker.

Android and Web require platform-appropriate engines:

-   Android uses a compatible Android inference/runtime option.
-   Web uses a browser-compatible runtime, potentially with Web Workers
    for inference.

Do not assume that a model or runtime that works on Android can also run
in a browser.

Potential Android candidates may be evaluated, but none should be
treated as approved until language coverage, translation quality, device
compatibility, model size, licensing, and network availability are
verified. In particular, do not assume a candidate library supports
Bangla or works reliably on the Huawei P60 Pro without testing.

### 7.3 Model download and lifecycle

The APK and initial Web bundle must remain small.

Required behavior:

-   Download a model only when a feature needs it and no compatible
    model is installed.
-   Automatically download missing models whenever any internet
    connection is available, including mobile data, subject to the
    user's platform/network settings.
-   Never redownload a valid installed model unnecessarily.
-   Track model version, compatibility, download state, and integrity.
-   Support retries after interrupted downloads.
-   Do not block the main UI while downloading or initializing a model.
-   Provide a visible download/progress state.
-   Allow users to manage downloaded models, including removing them to
    reclaim storage.
-   Keep model binaries out of D1.
-   Do not introduce R2 solely for model storage; choose a compatible
    provider distribution or hosting mechanism after validating model
    size, access, and delivery constraints.

The exact download unit depends on the chosen engine and model
packaging. Do not assume one independent model per language or one model
per direction.

### 7.4 Online/offline decision flow

1.  User enters text and chooses or accepts source/target languages.
2.  Client checks whether a compatible local model is installed and
    usable.
3.  If the user requests offline translation and a compatible model
    exists, translate locally.
4.  If online translation is available and selected, call the Worker
    translation endpoint.
5.  If online translation is unavailable, use a compatible local model
    if installed.
6.  If no compatible local model exists, explain that offline
    translation is unavailable and offer the required model download
    when connectivity returns.
7.  Save the user's explicit translation action locally as history.
8.  Queue account synchronization when signed in and online.

The UI should distinguish a translation that came from an online
provider from one produced by an offline model when that distinction is
useful to the user.

------------------------------------------------------------------------

## 8. Local storage, cache, and synchronization

### 8.1 Web storage

Use IndexedDB for durable local data. Avoid using `localStorage` as the
primary database for history or saved vocabulary.

### 8.2 Android storage

Use Room over SQLite. Persist history, saved vocabulary, dictionary
cache, translation cache, and pending sync operations as separate
logical data sets.

### 8.3 Account isolation

Account switching is a high-priority correctness requirement.

-   Namespace local personal records by Firebase UID.
-   Keep pending sync operations associated with their original owner.
-   Never upload one account's pending records under another account.
-   On sign-out, stop account-specific synchronization.
-   On sign-in as another account, load only that account's records.
-   Keep public dictionary cache separate from account-specific data.
-   Test sign-out/sign-in and account switching on both platforms.

### 8.4 Sync strategy

Use local-first writes for personal data:

1.  Write locally.
2.  Mark the record pending sync.
3.  Synchronize when authenticated connectivity is available.
4.  Mark the local record synchronized after server confirmation.
5.  Retry safely after network or server errors.

Use incremental sync. Do not download the entire history and saved
collection on every application launch.

### 8.5 Cache eviction

-   Use configurable size limits and expiry for non-personal caches.
-   LRU eviction is suitable for dictionary and translation cache
    entries.
-   Do not evict saved vocabulary.
-   Do not evict unsynchronized personal history.
-   Preserve the user's ability to access previously synchronized
    history and saved vocabulary offline, subject to device storage.

------------------------------------------------------------------------

## 9. Dictionary search and browsing

Improve the existing dictionary without replacing its core data model.

### Required improvements

-   Cursor-based pagination or another tested stable pagination
    mechanism.
-   HSK-level filtering.
-   Part-of-speech filtering.
-   Language filtering for English, Bangla, and Simplified Chinese.
-   Pinyin tone-insensitive search.
-   Search-term highlighting.
-   Exact, normalized, prefix, phonetic, and meaning ranking.
-   Suggestions for likely matches.
-   A Saved view backed by the complete local/account collection, not
    only the current search page.
-   Clear loading, empty, and error states.

Search should preserve original spellings and diacritics for display
even when normalized text is used for matching.

------------------------------------------------------------------------

## 10. Web and Android feature parity

The Web and Android experiences should provide the same core
capabilities while respecting platform conventions.

  -----------------------------------------------------------------------
  Capability              Web                     Android
  ----------------------- ----------------------- -----------------------
  Search dictionary       Required                Required

  English, Bangla,        Required                Required
  Chinese                                         

  Translation in six      Required                Required
  directions                                      

  Automatic source        Required                Required
  detection                                       

  Manual source override  Required                Required

  Word, phrase, sentence  Required                Required
  input                                           

  Online translation      Required                Required

  Offline translation     Browser-compatible      Android-compatible
  when model installed    model                   model

  Dictionary              Browser speech where    Android speech service
  pronunciation           supported               where supported

  Saved vocabulary        IndexedDB + account     Room + account sync
                          sync                    

  Translation history     IndexedDB + account     Room + account sync
                          sync                    

  HSK/POS filters         Required                Required

  Pagination              Required                Required

  Search highlighting     Required                Required

  Offline access to       Required                Required
  saved/history                                   

  Model management        Required where          Required where
                          supported               supported
  -----------------------------------------------------------------------

Do not force identical implementation details across platforms. The goal
is equivalent user-facing behavior and consistent data semantics.

------------------------------------------------------------------------

## 11. Vocabulary details and learning integration

A detailed vocabulary view can be added after the core translator and
synchronization flows are stable.

Potential content:

-   Headword.
-   Language.
-   Phonetic transcription or Pinyin.
-   Part of speech.
-   English, Bangla, and Chinese meanings.
-   HSK level.
-   Examples and translations.
-   Pronunciation playback.
-   Related vocabulary.

Only show content that exists in a trusted source or curated SANZAR
data. Stroke order, audio, multiple examples, and related words should
not be fabricated when data is unavailable.

Saved vocabulary should connect directly to SANZAR Flashcards and
Practice. A user should be able to save a word from a dictionary entry
or translation result and later practice it.

Optional later enhancements:

-   Recent searches.
-   Word of the day.
-   More advanced vocabulary review.
-   User-selectable practice direction.

------------------------------------------------------------------------

## 12. Admin dictionary management

Retain the existing admin interface and improve it incrementally.

### Required admin enhancements

-   CSV import.
-   JSON import.
-   Import preview before writing.
-   Field and language validation.
-   Duplicate detection.
-   HSK and part-of-speech filters.
-   Bulk edit.
-   Draft/published workflow.
-   Import summary and error report.
-   Explicit policy for whether imported entries are drafts or
    published.

Import validation should detect:

-   Missing required headword fields.
-   Invalid language codes.
-   Invalid HSK values.
-   Duplicate entries.
-   Malformed text or encoding.
-   Missing optional translations.
-   Ambiguous or inconsistent records.

Missing translations may remain empty when allowed by the schema. Do not
invent translations to make an import appear complete.

------------------------------------------------------------------------

## 13. Security, privacy, and reliability

-   Verify Firebase ID tokens in the Worker for every personal-data
    endpoint.
-   Derive `user_id` from verified token claims.
-   Scope every history and saved-vocabulary query to the authenticated
    UID.
-   Validate all user input and enforce request-size limits.
-   Keep translation-provider secrets server-side.
-   Do not put private text into a shared cache by default.
-   Use idempotent writes for retries.
-   Use soft deletion/tombstones for synchronized personal data.
-   Avoid logging full private translation text unless there is a
    documented operational need and appropriate privacy controls.
-   Handle provider timeouts, rate limits, and network failures
    explicitly.
-   Ensure offline mode never claims a translation succeeded when no
    compatible model is available.

------------------------------------------------------------------------

## 14. Implementation roadmap

Implement in phases so that the existing Dictionary remains usable
throughout development.

### Phase 1 --- Stabilize the existing Dictionary

-   Review the current dictionary schema and data.
-   Add Bangla headword support with a backward-compatible migration.
-   Normalize language codes at API/client boundaries.
-   Improve search ranking and Pinyin normalization.
-   Add stable pagination.
-   Add HSK and part-of-speech filters.
-   Improve loading, empty, and error states.
-   Bring Android and Web to core feature parity.

**Exit condition:** The existing dictionary works reliably for all three
languages and can browse beyond the first result page.

### Phase 2 --- Saved vocabulary and account synchronization

-   Add the saved-vocabulary D1 schema.
-   Add Room and IndexedDB persistence.
-   Add authenticated API endpoints.
-   Implement local-first writes and incremental sync.
-   Add tombstone deletion and idempotent IDs.
-   Enforce account isolation.
-   Connect saved vocabulary to the complete Saved view.

**Exit condition:** A saved item persists across restarts, works
offline, and appears on another device signed into the same account.

### Phase 3 --- Online translation

-   Define the translation provider adapter.
-   Implement input validation and language selection.
-   Implement automatic detection and manual override.
-   Support all six language directions.
-   Add word, phrase, and sentence translation UI.
-   Keep provider secrets on the Worker.
-   Add clear provider error and retry states.

**Exit condition:** All six directions work online on Web and Android.

### Phase 4 --- Translation history

-   Add the history D1 schema.
-   Add local Room and IndexedDB history.
-   Save explicit translation actions locally first.
-   Implement incremental account sync.
-   Implement history pagination and deletion.
-   Prevent duplicate history on retries and cache hits.
-   Test account switching and cross-device access.

**Exit condition:** Each account sees only its own synchronized history
on both platforms.

### Phase 5 --- Offline translation and model management

-   Evaluate Android and Web inference engines independently.
-   Validate all required language pairs and translation quality.
-   Measure model size, memory use, and performance.
-   Test Android compatibility on the Huawei P60 Pro.
-   Implement demand-driven model downloads.
-   Add integrity/version checks and retry handling.
-   Implement offline/online routing and clear UI states.

**Exit condition:** Offline translation works for each supported pair
for which a compatible model has been verified and installed.
Unsupported pairs are clearly identified.

### Phase 6 --- Learning and Admin expansion

-   Add detailed vocabulary views.
-   Add pronunciation where platform support and data allow.
-   Integrate saved words with Flashcards and Practice.
-   Add Admin CSV/JSON import and preview.
-   Add duplicate and data-quality reporting.
-   Consider recent searches and word-of-day features.

**Exit condition:** Dictionary content can be managed efficiently and
saved vocabulary feeds the learning workflow.

### Phase 7 --- Optimization and release validation

-   Test performance on representative Web browsers and Android devices.
-   Validate Huawei P60 Pro compatibility.
-   Test model downloads on Wi-Fi and mobile data.
-   Test offline behavior and recovery after interrupted downloads.
-   Test account switching and sync conflicts.
-   Review privacy, security, and provider costs.
-   Verify APK and initial Web bundle size.

**Exit condition:** Core online, offline, synchronization, and
account-isolation scenarios pass release testing.

------------------------------------------------------------------------

## 15. Acceptance test checklist

### Dictionary

-   [ ] Search English headwords.
-   [ ] Search Bangla headwords.
-   [ ] Search Simplified Chinese headwords.
-   [ ] Search Chinese Pinyin with and without tone marks.
-   [ ] Search by meanings and phonetic forms.
-   [ ] Browse more than 60 results without missing or duplicating
    records.
-   [ ] Filter by language, HSK level, and part of speech.
-   [ ] Highlight matching search text.
-   [ ] Display original text and diacritics correctly.

### Translation

-   [ ] English → Bangla.
-   [ ] English → Simplified Chinese.
-   [ ] Bangla → English.
-   [ ] Bangla → Simplified Chinese.
-   [ ] Simplified Chinese → English.
-   [ ] Simplified Chinese → Bangla.
-   [ ] Automatic source-language detection.
-   [ ] Manual source-language override.
-   [ ] Word, phrase, and sentence translation.
-   [ ] Clear handling of unsupported pairs and provider errors.

### Saved vocabulary

-   [ ] Save a word while online.
-   [ ] Save a word while offline.
-   [ ] Saved words persist after application restart.
-   [ ] Saved words synchronize across Web and Android.
-   [ ] Saved words remain accessible offline.
-   [ ] Saved view includes items outside the current dictionary result
    page.
-   [ ] Deletion synchronizes across devices.

### Translation history

-   [ ] Explicit translation action creates one history item.
-   [ ] Cache hit alone does not create a history item.
-   [ ] Reopening an old history item does not create a duplicate.
-   [ ] History is saved locally before sync.
-   [ ] History synchronizes across devices for the same account.
-   [ ] History is isolated between different accounts.
-   [ ] Deletion synchronizes and does not reappear.
-   [ ] Offline-created history synchronizes after reconnection.

### Offline translation and models

-   [ ] No large translation model is bundled in the APK.
-   [ ] No large model is included in the initial Web bundle.
-   [ ] Missing required models can download when internet is available,
    including mobile data.
-   [ ] Installed valid models are not downloaded again unnecessarily.
-   [ ] Interrupted downloads can resume or retry safely.
-   [ ] Model version and integrity are checked.
-   [ ] Offline translation works for verified installed model pairs.
-   [ ] Unsupported offline pairs are clearly communicated.
-   [ ] Model download/inference does not freeze the main UI.

### Security and account behavior

-   [ ] Worker rejects invalid or expired Firebase ID tokens on
    protected endpoints.
-   [ ] Server derives ownership from verified token claims.
-   [ ] Client-supplied user IDs cannot access another account's data.
-   [ ] Account switching does not leak local history or saved
    vocabulary.
-   [ ] Pending sync records remain associated with their original
    account.
-   [ ] Public dictionary access does not expose personal account data.

### Admin

-   [ ] CSV import preview works.
-   [ ] JSON import preview works.
-   [ ] Invalid rows are reported.
-   [ ] Duplicate entries are detected.
-   [ ] Import publishing behavior is explicit.
-   [ ] Missing translations are not fabricated.

------------------------------------------------------------------------

## 16. Decisions to preserve

The following decisions define the intended architecture:

1.  Keep React + TypeScript + Vite for Web.
2.  Keep Kotlin + Jetpack Compose for Android.
3.  Keep Cloudflare Pages + Workers + D1.
4.  Keep Firebase Authentication; verify Firebase ID tokens in the
    Worker.
5.  Use a hybrid local + cloud data model.
6.  Use IndexedDB on Web and Room on Android.
7.  Support English, Bangla, and Simplified Chinese.
8.  Support all six translation directions.
9.  Keep dictionary entries, translation history, saved vocabulary, and
    translation cache separate.
10. Synchronize personal history and saved vocabulary by authenticated
    account.
11. Keep personal data isolated by Firebase UID.
12. Keep the APK and initial Web bundle small.
13. Download only missing translation models when needed and when
    connectivity is available, including mobile data.
14. Do not redownload valid installed models unnecessarily.
15. Validate translation engines and language coverage before selecting
    them.
16. Do not add Firestore or R2 as part of this design.
17. Prefer incremental implementation over a complete rewrite.

------------------------------------------------------------------------

## 17. Recommended implementation order

For the safest development sequence:

1.  Stabilize and extend the existing dictionary.
2.  Implement durable saved vocabulary and account sync.
3.  Implement online translation for all six directions.
4.  Implement local-first translation history and account sync.
5.  Evaluate and implement offline translation models.
6.  Add detailed vocabulary and Flashcards/Practice integration.
7.  Expand Admin import and finish release optimization.

This sequence delivers useful functionality early while avoiding
premature investment in unverified offline translation engines.

------------------------------------------------------------------------

## 18. Final architecture principle

SANZAR should treat the Dictionary as the vocabulary and translation
workspace, but keep its underlying data responsibilities distinct:

-   **`dictionary_entries`** is the shared, curated vocabulary source.
-   **`translation_history`** is the private record of a user's explicit
    translation activity.
-   **`saved_vocabulary`** is the private learning collection that
    follows the user across devices.
-   **Translation cache** is a disposable performance layer, not a
    record of user activity.

The result is a lightweight, local-first, account-synchronized
Dictionary and Translator that can expand without replacing SANZAR's
existing architecture.

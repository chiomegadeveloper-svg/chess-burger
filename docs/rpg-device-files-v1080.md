# RPG device files — v0.1080

RPG public assets now use a revision-aware device cache. A generated manifest fingerprints every downloadable file by SHA-256 and records its byte size. The production service worker receives that manifest at build time. Requests use a cache key containing the asset revision, so identical files survive releases while changed files are downloaded again. Activation removes obsolete revisions. The game-file cache is limited to 80 MiB; storage failure falls back to ordinary online loading.

Hero Room has an icon-only Download game files button with an accessible label and tooltip. A compact dialog shows the full pack size, saved size and file count before an optional download. The current pack contains 508 files, approximately 60.7 MiB, including artwork, animation engines, chess engines and the game page. Downloads use two connections, report progress, pause when the dialog closes and reuse completed files on retry. The same option is available while the hero is loading. No browser storage permission prompt or cookie-based asset storage is introduced.

OpenFreeMap vector tiles are cached separately when requested, with at most 48 entries of at most 1 MiB each. Source metadata refreshes online and can fall back to its saved response during connection failure. Unrelated external resources are excluded. API, authenticated and mutation requests are not cached; GPS/account/reward traffic retains its live behavior.

The existing v0.1072 map already applies a 45-degree orthographic ground projection, with upright marker artwork and compensated anchors. That rendering remains in place.

Verification: 12 checks passed for asset reuse, changed revisions, retained identical files, cache limits, unavailable storage, no-store responses, optional download concurrency/progress, cancellation/resume, API bypass, map tile limits and metadata fallback, manifest hashes, accessible controls, unsupported browsers, and shared map rendering requests. Production build passed. The managed HTTP preview cannot run service workers because it is not a secure browser context; HTTPS browser download verification follows publication.

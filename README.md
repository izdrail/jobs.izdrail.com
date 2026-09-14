# JobSwipe (jobs.izdrail.com)

Tinder-style job search: FastAPI backend + Ionic/Angular frontend, deployable as a
browser/PWA app and as an Android app via Capacitor.

## Architecture

- **`main.py` + `api/`** — FastAPI backend. Serves the built SPA and the JSON API
  under `/api/v1`. SQLite by default (`JOBSWIPE_DATABASE_URL` to override).
- **`frontend/`** — Ionic 8 / Angular 20 / Capacitor 6 app. Browser build lands in
  `frontend/www`; the Android project is generated from it.
- **`tests/`** — pytest suite for the backend (44 tests).
- **`frontend/src/**/*.spec.ts`** — Karma/Jasmine suite for the frontend (44 specs).

## Browser vs native API URL

The SPA and API are served from the same origin in production, but a Capacitor
Android WebView cannot resolve relative API paths. `environment.prod.ts` therefore
uses the **absolute** URL `https://jobs.izdrail.com/api/v1`, which works for both
browser and native builds. `environment.ts` keeps `http://localhost:1603/api/v1`
for local development. All API access goes through `environment.apiUrl`; no
hardcoded endpoints.

CORS is restricted to the app origins (Capacitor `https://localhost`,
`capacitor://localhost`, local dev servers). Override with the
`JOBSWIPE_CORS_ORIGINS` env var (comma-separated).

## Backend

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py            # serves on :1603
pytest tests/             # backend tests
```

Key endpoints (`/api/v1`): `auth/signup`, `auth/login`, `auth/refresh` (30-day
tokens, 7-day refresh grace), `jobs` (legacy keyword search), `jobs/search`
(filters + pagination), `jobs/detail?url=`, `jobs/export`, `applications`
(CRUD + PATCH status/notes with history), `swipes` (+ `DELETE /swipes/last`),
`billing/entitlement`, `billing/verify`, `devices`, `profile` (+ resume upload).

Configuration (env): `JOBSWIPE_SECRET_KEY` (JWT signing — set in production),
`JOBSWIPE_DATABASE_URL`, `JOBSWIPE_UPLOAD_DIR`, `JOBSWIPE_CORS_ORIGINS`,
`JOBSWIPE_IAPTIC_VALIDATOR_URL` + `JOBSWIPE_IAPTIC_API_KEY` (billing).

## Payments & billing

The backend is the entitlement authority: signup starts a server-side 3-day
trial, `GET /billing/entitlement` reports the effective state, and a client-side
store callback never grants access on its own.

Purchases are **not enabled yet** — they fail safely with an actionable error
instead of faking success. To enable them:

1. Pick a provider (Iaptic or RevenueCat) and create the `jobswipe_monthly`
   product in the Play Console / App Store Connect.
2. Set `environment.billing.provider` (+ public key) in `frontend/src/environments/`.
3. Wire the provider SDK into `BillingService.purchase()/restore()`.
4. Set `JOBSWIPE_IAPTIC_VALIDATOR_URL` and `JOBSWIPE_IAPTIC_API_KEY` on the server
   so `POST /billing/verify` can validate receipts.
5. Never commit merchant credentials.

## Frontend

```bash
cd frontend
npm ci
npm start              # dev server (Angular)
npm run build:prod     # production build into www/
npm test               # Karma/Jasmine (ChromeHeadlessCI for CI)
npm run lint           # eslint
```

Note on lint: the repository already has ~52 pre-existing `prefer-inject` lint
errors on `main` (the codebase standardises on constructor injection). New code
follows the existing style; migrate wholesale with
`ng generate @angular/core:inject` if you want a clean gate.

## Android

The Android project is **generated**, not committed (`frontend/android/` is
gitignored). Requirements: Node 22, Java 17, Android SDK 34 with build-tools 34.0.0.

```bash
cd frontend
npm ci
npm run build:prod
npx cap add android    # only the first time
npx cap sync android   # after every web build
npx cap open android   # Android Studio; or:
cd android && ./gradlew assembleDebug
```

The debug APK lands at `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
Install it on a device with USB debugging enabled:

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

App ID `io.ionic.jobswipe`, app name "JobSwipe", HTTPS-only scheme. Job detail
deep links (`/job/:url`) are routed in-app; full Android App Links
(verified `https://jobs.izdrail.com/job/...` intents) need
`assetlinks.json` hosting + intent filters in the generated manifest — not yet
configured.

### Release signing (future)

CI builds a debug APK only. To ship a signed AAB later: base64-encode your
keystore into the `ANDROID_KEYSTORE_BASE64` secret plus
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, then
add a signing config to the generated `android/app/build.gradle` reading those
env vars. Never commit a keystore or passwords.

## Android CI (`.github/workflows/android.yml`)

Runs on pushes to `main` touching `frontend/**` (or the workflow), on matching
PRs, and on manual dispatch. Steps: checkout → Node 22 (npm cache) → Java 17
(temurin) → Android SDK 34 → `npm ci` → `npm run build:prod` → `cap add android`
(if missing) → `cap sync android` → `./gradlew assembleDebug` → fail if the APK
is missing → upload `app-debug.apk` as the `app-debug` artifact.

The deploy workflow (`.github/workflows/deploy.yml`) builds and pushes the
Docker image on `main` pushes.

## Verified in this change

- Backend: 44 pytest tests pass (auth incl. refresh grace, search filters +
  pagination, job detail 404, applications auth/ownership/PATCH, billing
  fail-safe, devices, profile/resume validation).
- Frontend: `npm run build:prod` passes; built bundle contains the absolute
  production API URL and no localhost reference; 44 Karma specs pass on
  ChromeHeadlessCI (storage, auth persistence/refresh/logout, interceptor
  401-retry-loop prevention, search/error/404 behaviour, no-mocks-in-prod,
  entitlement/no-fake-purchase, offline outbox sync).
- `npx cap add android` + `npx cap sync android` verified from a clean state.

Not verified here (needs your machine/CI): the Gradle APK build itself (this
workspace has Java 11, needs 17), on-device smoke test, real store purchases.

# HIMOTO Mobile App Plan

## Implementation status (first stage)

The existing Next.js server exposes native login, refresh, logout, account, bootstrap, dashboard, and contract/customer/fleet read routes. Contract and vehicle history have mobile endpoints and screens; customer detail uses the server's profile projection. Mobile also has a finance summary, store directory, staff directory, recent shift report summaries, scoped customer creation, team duty-roster create/edit/soft-delete, and unissued contract-draft CRUD. The duty roster is weekly shift scheduling, not clock attendance. More groups modules by work area and filters entries by permission; modules without mobile workflows are labeled unavailable. The local mobile session migration has been applied by the user and local login works. Verify customer, duty-roster, and contract-draft writes with test records in the isolated database. Vehicle creation remains a preview; contract drafts can be created/edited/deleted, while finalization and rental lifecycle actions remain planned. See [mobile-api.md](mobile-api.md) for implemented endpoints and [mobile-crud-roadmap.md](mobile-crud-roadmap.md) for the module rollout.

## 1. Goal and recommended approach

Build the mobile app in `Himoto_App/frontend`. Complete native authentication and the tested API contract for each feature before implementing its business screen. HIMOTO's current backend is the Next.js server in `Himoto/`: route handlers are under `src/app/api/`, domain/database operations are in `src/lib/server/`, and PostgreSQL connects to the Supabase `himoto` schema. The Expo app calls the API over HTTPS and never connects directly to PostgreSQL or contains database/provider secrets.

Do not copy the entire web backend into the Expo app. Server files depend on Node APIs, `pg`, Next.js request/cookie helpers, private environment variables, and server-side scope enforcement. Copying those into a mobile bundle would break the code and expose credentials. Reuse the running HIMOTO backend and its business rules. If a separate mobile API deployment is required, build a thin API service that reuses extracted server-only domain modules, not a second fork of every route and SQL statement.

Recommended first architecture: add a versioned mobile API/auth adapter to the existing Next.js backend, initially under `/api/mobile/v1/`, and call it from Expo. Preserve `/api/auth/*` for the web app. Extract shared logic only where an adapter needs it, retaining one implementation of each business rule.

## 2. Current state and constraints

- The web API has 71 route files: 67 under `/api/auth`, plus session, cron, and provider webhook routes. The catch-all `/api/auth/[...path]` handles much of the web app's data API.
- Most protected routes enter through `withAccessRequest`, which loads the account, permissions, and branch scope; the catch-all and some handlers also use `protectDatabaseRequest`. Several handlers then read `SESSION_COOKIE` directly again (including vehicle actions/import/reset, contract payments/finalization, returns, photos, and OCR). Moving only the outer guard to bearer auth would leave these handlers unusable from mobile. Refactor each selected operation to accept the resolved actor explicitly. Non-admin queries use transaction-local PostgreSQL role/scope settings, which must remain server-side.
- Web login at `/api/session` issues an eight-hour HttpOnly, SameSite Strict cookie. Write requests also pass a same-origin check. React Native does not use this browser flow reliably: an Expo API URL does not supply a session, and the POST origin check is not a native authentication protocol.
- The Expo client now has a Router route tree, tab shell, login, SecureStore session handling, and read-only first screens. Its new packages are declared but still require `npm install` from a network-enabled environment before device validation.
- Existing checks are focused scripts (`npm run test:*`), not one complete route integration suite. Catalogue all existing routes, and test every method actually published under `/api/mobile/v1` before its mobile screen ships. Run web regressions for every shared service or authorization change.
- The server grants vehicle viewing, transfer, and receipt to every authenticated workspace account, while other domains follow role and branch permissions. Fleet reads have special scope behavior; a mobile branch picker is only a filter, never an authorization grant.

## 3. Target layout

```text
Himoto/                         Existing web app and server API
  src/app/api/                  Web and future versioned mobile route adapters
  src/lib/server/               Server-only auth, business rules, integrations, DB
  scripts/                      Existing checks plus mobile API contract checks
Himoto_App/
  backend/start-dev.mjs          Local launcher for the existing Next.js API
  docs/mobile-app-plan.md       This plan and decisions
  docs/mobile-system.md         Backend and frontend architecture
  frontend/                     Expo client, navigation, screens, API client
```

Keep API request/response types in a shared, client-safe package or generated schema. Never put `src/lib/server/` in a mobile import path. Use versioned DTOs rather than returning database rows wholesale; exclude password hashes, internal integration settings, signed provider credentials, and fields the account lacks permission to see.

## 4. Backend-first implementation phases

### Phase A — Inventory and test baseline

1. Build a manifest of every current route path, HTTP method, request shape, response shape, permission, branch-scope rule, and external side effect. Include catch-all actions in addition to physical `route.ts` files. Mark which operations the first mobile release actually needs.
2. Record database tables/functions and required SQL migrations for each feature. Confirm the test database is a separate non-production Supabase project, with representative test accounts for admin, all-branch, and branch-limited access.
3. Run existing checks listed in section 7 and record baseline results. Add regression tests before moving or changing shared logic.
4. Define a seeded test-data reset/cleanup process. Tests for writes must use test records and revisions; do not test mutations against live rental/finance records.

**Exit gate:** all web routes are inventoried, every planned mobile route/method has a contract and test owner, authorization and branch-scope expectations are written down, and existing web checks pass or known failures are recorded.

### Phase B — Native authentication and authorization

1. Add a native login/session API that authenticates the same active HIMOTO accounts and applies the existing account-access rules. Do not return password hashes or permit clients to choose a user ID, role, permission, or `store_id`.
2. Use opaque, revocable mobile sessions: a short-lived access token and rotating refresh token, with only their hashes stored server-side. Support logout, revoke-this-device, account disablement, and token rotation. Choose exact lifetimes in the API contract; the system design proposes 15 minutes and 30 days.
3. Store mobile credentials in iOS Keychain/Android Keystore via an Expo SecureStore integration. Never put them in AsyncStorage, app config, source, or `.env`.
4. Resolve web cookies and verified mobile bearer tokens into the same account/permission/scope representation. Refactor selected handlers that read `SESSION_COOKIE` or call `verifySession` internally so they receive the authenticated actor from their adapter. Keep web CSRF/origin protection for cookie writes; native bearer requests use a separate explicit path and rate limits.
5. Add brute-force controls, generic login errors, expiry/revocation tests, and audit logging without recording passwords or tokens.

**Exit gate:** unauthenticated, expired, revoked, disabled, and unauthorized users are denied; branch-limited users cannot read or mutate another branch; existing web login and write protections remain green.

### Phase C — Versioned mobile API adapter

1. Create `/api/mobile/v1/` route handlers that validate request schemas, resolve the bearer session, authorize the operation, and call existing server/domain functions.
2. Return stable, documented DTOs and consistent errors (`code`, safe `message`, optional field errors, request ID). Set `Cache-Control: no-store` for private data.
3. Add pagination/filtering and explicit field selection for large lists. Do not make mobile download every web table and filter it locally.
4. Make retries safe: writes that can be retried need request IDs/idempotency keys and revision/concurrency checks. Preserve current transaction, backup, and audit behavior.
5. Handle uploads with server-issued short-lived signed uploads or existing authenticated upload flows. Never ship Cloudinary, OCR, GPS, Telegram, SePay, or database secrets to Expo.

**Exit gate:** every published route has a schema, permission mapping, success/error contract, rate limit policy, and automated positive/negative test.

### Phase D — Endpoint and integration testing

Test every method published in the mobile v1 API and run web regression checks for each shared operation. Keep a separate inventory for the existing web routes so gaps remain visible; a full web API audit can proceed by domain without delaying a smaller mobile release. Run tests in layers:

- **Unit:** validators, DTO mapping, permission mapping, date/money rules, token expiry/signature/rotation, idempotency, and domain service edge cases.
- **API contract:** each route/method validates status, JSON shape, content type, no-store headers, and safe error behavior.
- **Authorization:** no token, malformed token, expired/revoked token, disabled user, insufficient permission, another branch, and admin/all-branch access.
- **Database integration:** use a dedicated test database, seeded records, real transaction/rollback behavior, revision conflicts, and teardown. Verify data is unchanged after denied or failed writes.
- **Provider integration:** mock providers by default. Run explicitly enabled sandbox checks for OCR, media upload, GPS, SePay, Zalo, and Telegram; never let ordinary tests send real notifications, transfer money, or alter production GPS integrations.
- **Regression:** preserve the web test suite and add paired checks where mobile and web call the same domain operation.

**Exit gate:** the mobile v1 manifest reports every published method tested, core auth/scope/domain tests pass, provider tests are isolated, and relevant existing web checks pass in their supported environments. Database integration tests use the isolated test database.

### Phase E — Mobile client after backend gates

1. Install Expo Router and replace the blank `App.tsx` entry with a permission-aware tab layout. Add an API client that reads only `EXPO_PUBLIC_API_BASE_URL`, attaches the short-lived bearer token, handles 401/403/429/503 consistently, times out requests, and refreshes a session once without retry loops. See [mobile-system.md](mobile-system.md) for the route tree and screen mapping.
2. Implement login/logout/session restore with SecureStore; show loading, empty, offline, permission-denied, and retry states.
3. Build one read-only feature at a time (recommended: stores/vehicle inventory, then customer/contract lookup) using only v1 DTOs. Test with branch-limited accounts on a real device.
4. Add write features only after their backend contract, idempotency, confirmation UX, and rollback/error cases pass. Financial, contract-finalization, vehicle-transfer, bulk-delete, and integration-setting writes need explicit product review and stronger confirmation.
5. Add crash reporting, request IDs, app version headers, safe diagnostics, accessibility, and offline behavior. Never log personal/financial records or credentials.

### Phase F — Release and operations

Set up dev/staging/production API hosts, HTTPS, rate limits, monitoring, session revocation, backup/restore, and a mobile release process. Test upgrades and old-client compatibility before changing v1 response fields. Use a new API version for breaking changes. Keep database migrations reviewed and applied before deploying code that needs them.

## 5. Existing endpoint inventory to cover

The list below is the current web backend surface to catalogue and map. It does not mean every existing route belongs in the first mobile release. The mobile v1 test manifest must record every exported method it publishes. Also inventory all `GET/POST/PUT/PATCH/DELETE` actions inside the web catch-all route.

### Session and common data

- `/api/session` — `GET`, `POST`, `DELETE` (web cookie session; add/test a distinct native session API).
- `/api/auth/[...path]` — catch-all `GET`, `POST`, `PUT`, `PATCH`, `DELETE`; covers staff, customer, store, vehicle, contract, cashbook, and management data operations.
- `/api/auth/accounts`, `/api/auth/bulk-delete/{kind}`, `/api/auth/contract-staff`, `/api/auth/contract-types`, `/api/auth/contract-telegram-pending`, `/api/auth/payment-events`, `/api/auth/store-directory`.

### Customers, contracts, payments, and battery rentals

- `/api/auth/customers/import`, `/api/auth/customers/match-stores`, `/api/auth/customers/{id}/blacklist`, `/api/auth/customers/{id}/payments`.
- `/api/auth/order/car-rental/{id}/battery-swaps`, `/debt-reminder`, `/draft`, `/finalize`, `/handover`, `/history`, `/lifecycle`, `/payment-qr`, `/payments`, `/profile`, `/refund-qr`, `/renewals`, `/reservation-no-show`, `/telegram` (each suffix is beneath the `order/car-rental/{id}` prefix).
- `/api/auth/battery-contracts`, `/api/auth/battery-contracts/{id}`, `/api/auth/battery-contracts/{id}/actions`.
- `/api/auth/returns`, `/api/auth/returns/recover`, `/api/auth/returns/vehicle`, `/api/auth/rental-revenue`.

### Staff, finance, stores, and shift operations

- `/api/auth/staff-sales`, `/api/auth/staff-sales/owned-fleet-revenue`, `/api/auth/staff-sales/rental-overview`, `/api/auth/staff-sales/vehicle-revenue`.
- `/api/auth/debt-reminders`, `/api/auth/duty-roster`, `/api/auth/duty-roster/{id}`, `/api/auth/shift-reports`, `/api/auth/shift-reports/autofill`, `/api/auth/shift-reports/{id}/audit`, `/api/auth/shift-reports/{id}/media/{mediaId}`, `/api/auth/shift-reports/{id}/photos/{slot}`, `/api/auth/shift-reports/{id}/telegram`.
- `/api/auth/stores`, `/api/auth/stores/{id}`, `/api/auth/stores/managers`, `/api/auth/integrations`.

### Vehicles, media, GPS, and provider endpoints

- `/api/auth/vehicles`, `/api/auth/vehicles/{id}`, `/api/auth/vehicles/{id}/actions`, `/api/auth/vehicles/{id}/history`, `/api/auth/vehicles/{id}/transfers/{eventId}/telegram`, `/api/auth/vehicles/backups/{id}`, `/api/auth/vehicles/import`, `/api/auth/vehicles/inventory`, `/api/auth/vehicles/reset`, `/api/auth/vehicles/transfers`.
- `/api/auth/gps`, `/api/auth/gps/debts`, `/api/auth/gps/refresh`, `/api/auth/photo-ocr`, `/api/auth/photo-uploads/sign`, `/api/auth/record-photos/{entity}/{id}`, `/api/auth/record-photos/{entity}/{id}/{slot}`.
- `/api/cron/integrations` (signed worker), `/api/webhooks/gps/iopgps/{accountId}`, `/api/webhooks/sepay` (provider-authenticated; not mobile user endpoints).

For each mobile v1 path/method, test request validation, permission and branch rules, representative success, not found, conflict/revision failure, provider failure where relevant, and safe errors. Test provider webhooks separately from user-authenticated mobile calls. When a web operation is reused, run its existing regression checks too.

## 6. Environment settings

### Server: `Himoto_App/.env` for the local launcher

Copy `Himoto_App/.env.example` to `Himoto_App/.env`. The minimum for the existing backend is:

```dotenv
# Required: Supabase PostgreSQL transaction pooler URL (port 6543).
DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@POOLER_HOST:6543/postgres

# Set a stable random value locally; production requires at least 32 characters.
MANAGEMENT_SESSION_SECRET=REPLACE_WITH_RANDOM_64_HEX_CHARACTERS
LOGIN_MODE=true
```

Start with `node Himoto_App/backend/start-dev.mjs` from the workspace root; it loads `Himoto_App/.env` into the existing Next.js server. Apply `Himoto/docs/sql/2026-10-25-mobile-sessions.sql` to the isolated test database before calling native auth. Set `LOGIN_MODE=false` to block new web and mobile password sign-ins; it defaults to `true`, and existing sessions continue until expiry/revocation. `SUPABASE_DATABASE_URL` is accepted as a fallback if `DATABASE_URL` is unset. Generate a local secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; keep it stable between runs. `DATABASE_SSL_CA` is optional; the Supabase root CA is already included. Never commit `.env` or put a server value in Expo config.

Optional server values, only for endpoint families that use them:

| Endpoint/functionality     | Variables                                                                                                                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR                        | `GEMINI_API_KEY` (or legacy `GOOGLE_API_KEY`), `GEMINI_OCR_MODEL`                                                                                                   | Needed for live OCR. Tests should mock Gemini unless running a dedicated sandbox check.                                                                                                                                                                                                                                                                                                                                                                                       |
| Signed image/video uploads | `CLOUDINARY_URL` **or** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                                                                      | API secret stays on server. The Cloudinary account and upload records must also be valid.                                                                                                                                                                                                                                                                                                                                                                                     |
| CloudFly video storage     | `VIDEO_STORAGE_PROVIDER=cloudfly`, `CLOUDFLY_S3_ENDPOINT`, `CLOUDFLY_S3_REGION`, `CLOUDFLY_S3_BUCKET`, `CLOUDFLY_S3_ACCESS_KEY_ID`, `CLOUDFLY_S3_SECRET_ACCESS_KEY` | Otherwise storage defaults to Cloudinary. Apply `../../Himoto/docs/sql/2026-10-22-cloudfly-videos.sql` before enabling CloudFly.                                                                                                                                                                                                                                                                                                                                              |
| SePay webhook              | `SEPAY_WEBHOOK_SECRET`, `SEPAY_MODE=test`                                                                                                                           | Secret must match the provider Authorization API key. Keep test mode. For a simulated contract payment, the receiving bank account comes from the active branch bank records in HIMOTO's database. `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NUMBER`, `SEPAY_ACCOUNT_NAME`, and `SEPAY_BANK_ID` are legacy demo settings, not a fallback for those records. `SEPAY_SERVICE_USER_ID` is only needed to test live automatic ledger posting; test mode does not alter contract balances. |
| Zalo debt reminder         | `ZALO_REMINDER_WEBHOOK_URL`                                                                                                                                         | Optional server override; otherwise the webhook is configured in the database/admin integration UI. Do not expose or log it.                                                                                                                                                                                                                                                                                                                                                  |
| Legacy rental module link  | `NEXT_PUBLIC_RENTAL_APP_URL`                                                                                                                                        | UI navigation only; not required for mobile API tests.                                                                                                                                                                                                                                                                                                                                                                                                                        |

GPS, Telegram, and other integration credentials are managed in encrypted HIMOTO database settings rather than being added as Expo variables. Tests must use test integrations or mocks. Provider webhooks need a reachable HTTPS deployment/tunnel and provider-side test configuration; they cannot be fully tested against localhost by setting `.env` alone.

The DB must already have the migrations required by the endpoint being tested, plus active test accounts and test rows. Review `Himoto/docs/sql/` and the feature docs before running write tests. Do not point a broad endpoint suite at production data.

### Client: `Himoto_App/frontend/.env.local`

The only client setting planned is the API host:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
```

Use `127.0.0.1` for a local iOS simulator; for an Android emulator use `http://10.0.2.2:3000`; for a physical phone use `http://<computer-LAN-IP>:3000` and start the Next dev server bound to the LAN (the current web `dev` script binds to `127.0.0.1`, so it is not reachable from a phone as-is). Use the deployed HTTPS host for remote devices. `EXPO_PUBLIC_` values are compiled into the client and are public; this variable is only a URL. Expo documents this client-side inlining and warns against placing secrets in such variables: [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

The new Expo client reads this value for the mobile v1 API. No `.env` field can make existing cookie-authenticated web routes work from Expo by itself.

## 7. Test and smoke-test checklist

### Existing web backend baseline

From `Himoto/`, configure `.env.local`, install dependencies, then run the checks below. Start the API for manual smoke checks with `npm run dev`; use the web login on that same origin for the existing cookie-authenticated routes. A successful `/api/session` login is needed before a protected route can be smoke-tested.

```sh
npm ci
npm run typecheck
npm run lint
npm run test:login
npm run test:account-scope
npm run test:scoped-pool
npm run test:contracts
npm run test:contract-billing
npm run test:contract-payments
npm run test:contract-finalize
npm run test:stores
npm run test:vehicles
npm run test:vehicle-transfers
npm run test:cashbook
npm run test:customer-import
npm run test:photo-ocr
npm run test:gps-contract-integrations
npm run build
```

These are a representative baseline. The 49 existing `test:*` scripts include focused checks and do not amount to an all-route HTTP suite. Run the relevant scripts for changed domains and add real authenticated tests for every new mobile v1 method against a dedicated test database.

### Backend mobile API gates

1. Start the web/API server against the test DB; verify it is reachable and the existing web login/session works. After Phase B, test native login, refresh, logout, and revocation too.
2. Run the mobile v1 route manifest unauthenticated and assert protected endpoints deny access; then run each published route/method with admin, all-branch, and branch-limited test accounts.
3. Exercise valid, invalid, boundary, duplicate/idempotent, conflict/revision, and provider-timeout cases. Assert failed writes leave no partial database changes.
4. Run the web regression suite after each auth or shared-domain change. Verify the old browser cookie flow still works.
5. Require all route/method tests, auth/scope tests, typecheck, lint, build, and feature regressions to pass before connecting Expo screens.

## 8. Security and release rules

- Never put `DATABASE_URL`, session signing keys, Cloudinary API secrets, Gemini keys, SePay webhook keys, GPS credentials, or Telegram tokens in Expo `.env`, `app.json`, source, or app logs.
- Enforce permission and branch scope on the server for every request. Hiding a button or route in the app is not authorization.
- Use HTTPS outside local development, rate-limit login and costly provider endpoints, redact personal data, and revoke tokens on logout/account disablement.
- Keep test and production DB/provider credentials separate. Run tests that write records only against the dedicated test environment.
- Do not ship mutations until retries are idempotent, revision checks are in place, and success/failure states are verified on-device.

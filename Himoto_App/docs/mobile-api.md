# Mobile API v1: implemented contract

Base path: `/api/mobile/v1` on the existing `Himoto` Next.js server. All private calls require `Authorization: Bearer <accessToken>`; browser session cookies do not authenticate these routes. Responses use `Cache-Control: no-store`.

Success: `{ "data": ..., "meta": { "requestId": "..." } }`. Failure: `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`. Common errors are `INVALID_INPUT` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `RATE_LIMITED` (429), and `UNAVAILABLE` (503).

## Session

| Method and path | Body | Result |
| --- | --- | --- |
| `POST /auth/login` | `{ "email": "...", "password": "..." }` | User and 15-minute access / rotating 30-day refresh tokens. Ten attempts per login name in a 15-minute window. |
| `POST /auth/refresh` | `{ "refreshToken": "..." }` | New access and refresh tokens; previous pair becomes invalid. |
| `POST /auth/logout` | `{ "refreshToken": "..." }` | Revokes that device session. |
| `GET /me` | Bearer token | Current active account and permissions. |

`LOGIN_MODE` is a server-only setting, defaulting to `true`. Set `LOGIN_MODE=false` in `Himoto_App/.env` to block new password sign-ins on both web and mobile. Existing sessions can still refresh and log out until their normal expiry or revocation. Restart the local server after changing this setting.

Only token hashes are stored in `himoto.management_mobile_sessions`. Apply `Himoto/docs/sql/2026-10-25-mobile-sessions.sql` to the isolated test database before testing auth. Disabled accounts lose access immediately. Expo stores the pair in SecureStore.

## Read endpoints

| Method and path | Permission | Result |
| --- | --- | --- |
| `GET /bootstrap` | Active account | User and store directory. |
| `GET /dashboard` | Active account | Permitted contract counts and fleet count. |
| `GET /me/duty-roster` | Active account | This account's linked staff profile shifts for the current Vietnam week only; no coworker roster or attendance punch records. |
| `GET /duty-roster?week=YYYY-MM-DD&store_id=ID` | `hr.read` | Weekly team schedule, optionally filtered by a store the actor can access. |
| `GET /finance/summary` | `finance.read` | Vietnam month-to-date rental revenue, actual cashbook income and expense, and voucher counts. Uses the same cashbook breakdown as the web summary; excludes deposits from rental revenue. |
| `GET /staff` | `hr.read` | Paged staff directory with code, name, position, status, and store; no contact details or notes. |
| `GET /shift-reports` | `contracts.read` | Up to 50 recent shift report summaries with date, status, and store; no report payload or media. |
| `GET /contracts`, `GET /contracts/{id}` | `contracts.read` | Paged contract summaries and one summary. |
| `GET /contracts/drafts/{id}` | `contracts.read` | An unissued draft's editor data and latest revision. Includes draft customer fields needed for editing; returns no issued contract payload. |
| `GET /contracts/{id}/payments` | `contracts.read` | Payment context and active receipt accounts for the contract's store. |
| `GET /contracts/{id}/renewals` | `contracts.read` | Contract vehicle lines, including returned lines needed for historical renewal entry. |
| `GET /contracts/{id}/history` | `contracts.read` | Contract changes and cashflow entries; `404` for a missing contract. |
| `GET /customers`, `GET /customers/{id}` | `customers.read` | Paged customer summaries and a profile detail with contact, address, document, warning, rental-origin, and contract-count fields. |
| `GET /vehicles`, `GET /vehicles/{id}` | `vehicles.read` | Paged fleet summaries and one summary, including inventory fields and edit revision; existing fleet visibility rule applies. |
| `GET /vehicles/{id}/history` | `vehicles.read` | Read-only vehicle event timeline using the existing `fleet_read` database scope. |

## Write endpoints

| Method and path | Permission | Body | Result |
| --- | --- | --- | --- |
| `POST /contracts/draft` (alias of `/contracts/drafts`) | `contracts.draft` | `{ "edits": { "status": "draft", "rental_type": "daily", "notes": "", "draft": { "...": "web ContractDraft fields" } }, "request_id": "<uuid-v4>" }` | Creates an unissued draft with the shared web service. The singular path is used by the Home **Làm hợp đồng** shortcut; the plural path remains supported. |
| `POST /vehicles` | `vehicles.write` | `{ "name": "Vision 110", "license": "59A1-12345", "brand": "Honda", "type": "xega", "year": 2025, "store_id": 7, "status": "ready", "color": "Đen", "chassis": "...", "engine": "...", "odometer": 0, "note": "" }` | Creates an inventory vehicle through the shared web vehicle service; returns `{ id }` with HTTP 201. Requires an in-scope store and valid inventory values. Duplicate plates return 409. |
| `PATCH /vehicles/{id}` | `vehicles.write` | Same inventory fields plus `revision` from the latest `GET` | Updates inventory with web validation, audit, and stale-revision checks. Open-contract and in-transit restrictions apply; conflicts return 409. |
| `POST /customers` | `customers.write` | `{ "name": "...", "phone": "...", "address": "...", "idCard": "001234567890", "storeId": 7 }` | Creates an active Vietnamese customer; returns `{ id, name }` with HTTP 201. The store must be within the actor's scope. Invalid fields return 400; an existing identity or phone match returns 409. |
| `POST /contracts/drafts` | `contracts.draft` | `{ "edits": { "status": "draft", "rental_type": "daily", "notes": "", "draft": { "...": "web ContractDraft fields" } }, "request_id": "<uuid-v4>" }` | Creates an unissued draft using the existing web `saveDatabaseDraft` service. Same actor, request ID, and payload safely replay the original result; reusing the key with different data returns 409. Requires a permitted `draft.store_id`. |
| `PATCH /contracts/drafts/{id}` | `contracts.draft` | `{ "edits": { "status": "draft", "rental_type": "daily", "notes": "", "revision": "<latest revision>", "draft": { "...": "web ContractDraft fields" } } }` | Updates an existing draft only. Stale revision or changed contract state returns 409; out-of-scope stores return 403. |
| `DELETE /contracts/drafts/{id}` | `contracts.draft` | `{ "revision": "<latest revision>" }` | Soft deletes an unissued draft. Rejects stale revisions, issued contracts, and drafts with linked transaction or vehicle history. |
| `POST /contracts/drafts/{id}/finalize` | `contracts.finalize` and `contracts.draft` | `{ "revision": "<latest revision>", "reservation": true, "receipts": [{ "purpose": "rental", "amount": "200000", "method": "transfer", "account_id": 4, "paid_at": "2026-10-26T09:30" }] }` | Issues a hold reservation, records actual receipts atomically, leaves the vehicle awaiting handover, and queues the web notification. Normal issuing uses the same route without `reservation`. |
| `POST /contracts/{id}/renewals` | `contracts.renew` | `{ "request_id": "<uuid-v4>", "item_id": 51, "item_revision": "<revision>", "order_revision": "<revision>", "return_at": "2026-10-28T09:30", "amount": "100000", "occurred_at": "2026-10-25T09:30", "note": "Bổ sung gia hạn đã ghi thiếu", "receipt": { "method": "cash", "account_id": 2, "paid_at": "2026-10-25T09:30" } }` | Records a missed renewal with web guards, revisions, idempotency, and audit history. `receipt` is optional if payment was not received. |
| `POST /contracts/{id}/payments` | `finance.write` | `{ "request_id": "<uuid-v4>", "revision": "<latest revision>", "amount": "100000", "method": "cash", "account_id": 2, "paid_at": "2026-10-25T09:30", "note": "Khoản thu đã nhận nhưng chưa nhập", "purpose": "extra" }` | Records an actual missing receipt or refund through the shared web payment service; request IDs make retries idempotent. |
| `POST /duty-roster` | `hr.write` | `{ "store_id": 7, "staff_id": 42, "starts_at": "2026-10-26T08:00", "ends_at": "2026-10-26T17:00", "shift_name": "Ca sáng", "role_in_shift": "Nhân viên trực", "notes": "", "request_id": "<uuid-v4>" }` | Creates a shift and returns its mobile schedule DTO with HTTP 201. Repeating an identical request ID safely returns the original shift. |
| `PATCH /duty-roster/{id}` | `hr.write` | Same fields plus `revision` from the latest read | Updates a shift; overlapping staff times or stale revisions return 409. |
| `DELETE /duty-roster/{id}` | `hr.write` | `{ "revision": "<latest revision>" }` | Soft deletes the shift; stale revisions return 409. |

Paged contract, customer, vehicle, and staff lists accept `page` (from 1), `size` (1–50, default 20), `search`, `store`, `status`, `sort`, and `direction`; contracts also accept `scope`. Success data is `{ items, page, total, hasMore }`. IDs are positive integers. Server permission and PostgreSQL row scope remain authoritative even when a `store` filter is supplied. Customer detail returns an explicit profile DTO and excludes relatives and database revision fields. Contract draft, reservation, renewal, and payment routes call the shared web services and preserve their transaction, account, audit, scope, revision, and idempotency rules. Vehicle writes call the shared web inventory service and do not expose generic vehicle deletion, transfer, receive, or contract lifecycle actions. Duty roster management shares the web app's time validation, active staff/store checks, overlap detection, idempotency key, optimistic revision, and soft-delete behavior; the mobile DTO omits staff phone numbers. Contract history returns `{ changes, cashflow }` with display fields; account numbers and raw revision payloads are excluded. Vehicle history returns event labels, timestamps, actor, and store routes when available; it omits freeform notes, customer contact details, ID-card details, contract IDs, and raw vehicle audit changes. GPS and remaining writes are later phases.

## Local verification

1. Set `DATABASE_URL` and `MANAGEMENT_SESSION_SECRET` in `Himoto_App/.env` using `.env.example`; use an isolated test Supabase project.
2. Apply the SQL migration above, then run `node Himoto_App/backend/start-dev.mjs` from the workspace root (`--lan` for a physical phone).
3. Set `EXPO_PUBLIC_API_BASE_URL` in `Himoto_App/frontend/.env.local`. Install client dependencies with `npm install` in `Himoto_App/frontend`, then run `npm start`.
4. Run `npm run test:mobile-auth`, `npm run test:mobile-reads`, `npm run test:mobile-customer-create`, `npm run test:duty-roster`, `npm run test:drafts`, and `npm run typecheck` in `Himoto/`. `test:drafts` covers the shared domain service; manually verify mobile draft endpoint auth, permission, scope, idempotent retry, stale revision, safe delete, and create/edit/delete against isolated test records before treating the workflow as integration-tested.

Provider credentials are unnecessary for these v1 routes. See [mobile-app-plan.md](mobile-app-plan.md#6-environment-settings) for later OCR, media, webhook, GPS, and finance test settings.

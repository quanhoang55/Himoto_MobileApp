# HIMOTO Mobile

The Expo app lives in `frontend/`. It uses Expo SDK 57, Expo Router, TypeScript, and React Native. The mobile API runs in the existing Next.js server in `../Himoto/`; `backend/start-dev.mjs` starts that server with this project's local environment.

Read [the mobile app plan](docs/mobile-app-plan.md) for implementation order, endpoint testing, and environment setup. [The mobile system design](docs/mobile-system.md) maps the backend layers and mobile screens to the current web application.

## Run locally

```sh
cd frontend
npm install
npm run start
```

Use the Expo Go app to scan the development QR code, or run `npm run ios` / `npm run android` with the corresponding simulator or device tooling installed. `npm run web` starts the web preview. Run `npm run typecheck` to check TypeScript.

The current app includes sign-in, a permission-aware tab shell, and read-only home, contract, customer, and fleet screens. Add `EXPO_PUBLIC_API_BASE_URL` to `frontend/.env.local` using `frontend/.env.example`. The client must never contain database credentials or provider secrets.

## Build a test APK

The Android package ID is `com.himoto.mobile`. Sign in to an Expo account, configure EAS for this project once, then build the internal APK:

```sh
cd frontend
eas login
eas build:configure
bun run build:android:preview
```

Download and install the APK from the EAS build link. This preview embeds `https://himoto.vercel.app` as its API host. The current public deployment returns 404 for `/api/mobile/v1/me`, so the APK can be installed and its screens explored, but sign-in and API-backed screens will work only after the mobile routes are deployed and the database migration is applied. See [Expo's APK build guide](https://docs.expo.dev/build-reference/apk/).

## Run the local backend

Copy `.env.example` to `.env`, add credentials for an isolated test database, apply `../Himoto/docs/sql/2026-10-25-mobile-sessions.sql`, then run `node backend/start-dev.mjs` from `Himoto_App/`. Add `--lan` when connecting from a physical phone on the same network. The launcher passes the environment to the existing Next.js server in `../Himoto/`; it requires Node.js 22 and the web app's installed dependencies. Production uses the server deployment's environment settings. See [the v1 API contract](docs/mobile-api.md) for current routes and test commands.

For local iOS Simulator testing without deploying, keep `frontend/.env.local` at `http://127.0.0.1:3000`. Apply the schema to the isolated test database with `node backend/apply-mobile-migration.mjs --confirm-test-database`, start `node backend/start-dev.mjs` in one terminal, then run `cd frontend && bun run ios` in another. The migration command requires the explicit confirmation flag and never prints the database URL. On the simulator, `GET http://127.0.0.1:3000/api/mobile/v1/me` should return JSON `401 UNAUTHENTICATED` before sign-in.

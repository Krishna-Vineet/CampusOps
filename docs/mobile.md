# Mobile app — setup, versioning and review

## Requirements

- Node **≥22.13** (pinned `.node-version` = 22.23.4). Expo CLI refuses older Node.
- Bun 1.4.4 for the monorepo (`.bun-version`).
- PostgreSQL migrated + seeded (see root README).

## Exact mobile pins

| Package | Version | Why |
|---|---|---|
| expo | 58.0.22 | SDK baseline; all `expo-*` pins come from its bundled native module map |
| react / react-dom | 19.3.0 | React Native 0.88 peer |
| react-native | 0.88.1 | SDK 58 baseline |
| react-native-web | 0.21.4 | Browser review preview |
| expo-camera | 58.0.14 | QR scanning (native camera + web fallback) |
| expo-secure-store | 58.0.2 | Native refresh-token storage |
| expo-linking | 58.0.15 | `campusops://` deep links |
| expo-constants | 58.0.14 | Config access |
| expo-status-bar | 58.0.4 | Status bar |
| react-native-safe-area-context | 5.10.1 | Safe areas |
| react-native-svg | 15.16.0 | QR rendering |
| qrcode-generator | 2.0.4 | Pure-JS QR matrix (no Node `fs`, unlike backend `qrcode`) |
| typescript | 5.9.3 | Matches Expo SDK 58 template |

Verification commands:

```bash
cd apps/mobile
npx expo install --check     # "Dependencies are up to date"
npx expo-doctor              # 17/17 checks passed
```

Do not upgrade individual `expo-*` packages by hand; use `npx expo install --fix` so the SDK map stays authoritative, then re-run doctor and the exports.

## Environment

| Variable | Where | Meaning |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Native builds | Absolute API origin, e.g. `https://api.example.com` (no `/api/v1`). Required on native; the app shows a setup error if missing. |
| `API_PROXY_TARGET` | `serve-preview.mjs` | Backend for the browser preview proxy (default `http://127.0.0.1:8787`). |
| `PORT` | preview server | Use `8081`; root `.env.local` exports `PORT=8787` for the API, so override it. |
| `MOBILE_SCHEME` | app config | Deep-link scheme, default `campusops`. |

## Run

```bash
# API + management web (separate terminals)
bun run dev:api
bun run dev:web

# Mobile browser review preview (low memory; no Metro watcher)
bun run build:mobile:web
PORT=8081 bun run preview:mobile

# Native development
cd apps/mobile
EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:8787 npx expo start
```

The preview server serves `apps/mobile/dist` and proxies `/api/*` and `/health/*` to the API, so browser code uses relative URLs only. It is labelled “Mobile app · browser review preview” and is not a student web portal.

## Tests

```bash
E2E_PASSWORD="$SEED_DEMO_PASSWORD" E2E_CHROMIUM_PATH=/usr/bin/chromium bun run e2e:mobile
```

12 checks against the exported bundle and real API: auth, event detail/registration state, free-form QR names/limits/rotation, toggle direction, switched-off explanation, organiser inspection + identity-confirmed scan, complaint scan/report/list, read-only profile, 390 px overflow, college vs outsider signup fields. Screenshots: `e2e/p5-01…05-*.png`.

Native exports (`npx expo export --platform android|ios`) produce Hermes bundles; physical camera/poster scanning still needs a device test.

# Environment variables: what goes where

## The three places config lives

| Place | File / UI | Who reads it | Secret? |
|---|---|---|---|
| **Local** | `.env.local` at repo root (git-ignored). Symlink `apps/api/.env.local → ../../.env.local`, or `set -a; . ./.env.local; set +a` before running. | Bun auto-loads `.env.local` for the process it starts | Yes — never commit |
| **Render (API)** | Service → Environment | The API process in production | Yes |
| **Vercel (website)** | Project → Settings → Environment Variables | Only `VITE_*` values are embedded into the static bundle | **Anything `VITE_*` is PUBLIC** |
| **Mobile builds** | `apps/mobile/.env` or shell env when running `expo start` / EAS | Only `EXPO_PUBLIC_*` values are embedded in the app | **Anything `EXPO_PUBLIC_*` is PUBLIC** |

The website and mobile app never receive database URLs, JWT secrets, Brevo keys or S3 keys. They only know the API origin. All secrets stay on the API host.

## Which `.env` file does what

- `.env.example` — committed template with every key and comments. Copy it.
- `.env.local` — your real local values. Ignored by Git.
- `apps/api/.env.local` — optional symlink to the root file so `cd apps/api && bun run dev` also works.
- `apps/mobile/.env` — only `EXPO_PUBLIC_API_URL` (and `MOBILE_SCHEME` if you change it).
- Vercel/Render dashboards — production values; no file is uploaded.

Bun load order: process environment > `.env.local` > `.env`. A variable exported in your shell always wins.

## Required for every environment

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://… neon.tech/campusops?sslmode=require` | Direct connection. Used by migrations/seed/bootstrap. |
| `JWT_ACCESS_SECRET` | 64 hex chars | `openssl rand -hex 32`. Signs 15-min access tokens. |
| `REFRESH_TOKEN_PEPPER` | 64 hex chars | Different value. Hashes refresh tokens at rest. |

Runtime prefers `DATABASE_URL_POOLED` when set (Neon pooled endpoint, `-pooler` host); migrations prefer `DATABASE_DIRECT_URL`/`DATABASE_URL`. With Neon transaction pooling the client disables prepared statements automatically.

## API variables (Render / local)

Groups, with defaults from `apps/api/src/config/env.ts`:

- **Runtime**: `NODE_ENV`, `PORT` (8787), `WEB_ORIGIN` (exact website origin, CORS), `APP_BASE_URL` (website URL used in emails), `CAMPUS_TIMEZONE` (Asia/Kolkata), `TRUST_PROXY_HEADERS` (true only behind Render/Vercel which strip client forwarding headers), `MOBILE_SCHEME` (campusops), `COMPLAINT_QR_BASE` (campusops://complaint).
- **Auth**: `ACCESS_TOKEN_TTL_SECONDS` (900), `REFRESH_TOKEN_TTL_DAYS` (30), `OTP_TTL_SECONDS` (600), `OTP_MAX_ATTEMPTS` (5).
- **Demo**: `DEMO_MODE`, `ALLOW_PRODUCTION_DEMO`, `EMAIL_MODE` (demo/brevo/resend), `EXPOSE_DEMO_OTP`, `SEED_DEMO_PASSWORD`. Production refuses demo email unless `ALLOW_PRODUCTION_DEMO=true`; `SEED_DEMO_PASSWORD` is refused in production. Keep all false/unset in production.
- **Email**: `EMAIL_FROM` (verified sender), `BREVO_API_KEY` (you already have it; never share it), or `RESEND_API_KEY`.
- **Storage**: `STORAGE_MODE` (disabled/s3), `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`, `S3_SIGNED_URL_TTL_SECONDS` (300), `UPLOAD_MAX_BYTES` (5 MiB).
- **QR**: `QR_TTL_SECONDS` (60, range 15–300), optional `QR_SIGNING_SECRET` (≥32 chars) to rotate QR keys without ending sessions.
- **Jobs**: `JOBS_ENABLED` (false on Render free), `JOB_INTERVAL_SECONDS`, `NOTIFICATIONS_ENABLED`, `OUTBOX_BATCH_SIZE`, `OUTBOX_MAX_ATTEMPTS`, `RESOURCE_HOLD_TTL_HOURS` (72).
- **Caps**: `OUTBOX_FANOUT_MAX`, `INVITATION_LIST_MAX`, `RESOURCE_AVAILABILITY_MAX_UNITS`, `APPROVER_DIRECTORY_MAX`, `REPORT_MAX_ATTENDEES`, `DB_POOL_MAX` (5).
- **Testing only**: `TEST_DATABASE_URL`, `RATE_LIMIT_SCALE` (must stay 1 in production).
- **Bootstrap only**: `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` — read once by `bun run admin:bootstrap`, then remove them.

Invalid combinations fail fast at startup with a message naming the variable (for example `STORAGE_MODE=s3 requires S3_BUCKET`).

## Website variables (Vercel)

The website uses **relative URLs** (`/api/v1/...`). `vercel.json` rewrites `/api/*` and `/health/*` to your Render API, so the browser sees one origin and the httpOnly refresh cookie works. Therefore the website needs **no** environment variables for normal operation. Do not put secrets in `VITE_*`.

If you instead host the API on a different origin without a rewrite, set `WEB_ORIGIN` on the API to the website origin and be aware that third-party cookie blocking can break refresh; the rewrite approach is the supported one.

## Mobile variables

| Variable | Where | Meaning |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | shell or `apps/mobile/.env` at build time | Absolute API origin, e.g. `https://campusops-api.onrender.com` (no `/api/v1`). Required for native builds; the app shows a setup error if missing. |
| `MOBILE_SCHEME` | app config | Deep-link scheme (`campusops`). |
| `API_PROXY_TARGET`, `PORT` | `serve-preview.mjs` only | Browser review preview proxy; not part of native builds. |

## Secret hygiene

- Never paste secrets into chat, issues, screenshots or commits.
- Rotate `JWT_ACCESS_SECRET` to invalidate all access tokens; rotate `REFRESH_TOKEN_PEPPER` to invalidate all refresh tokens; rotate `QR_SIGNING_SECRET` to invalidate outstanding QR codes.
- `.gitignore` excludes `.env` and `.env.*` except `.env.example`.

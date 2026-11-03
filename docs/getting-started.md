# Getting started (local development)

## 1. Install the tools

| Tool | Version | Why |
|---|---|---|
| **Bun** | 1.4.4 (pinned in `.bun-version`) | Runs the API, installs packages, runs tests and scripts |
| **Node.js** | ≥ 22.13 (pinned `apps/mobile/.node-version` = 22.23.4) | Expo CLI / Metro for the mobile app only |
| **PostgreSQL** | 17 locally, or a free **Neon** project | The only database |
| Git | any recent | Version control |

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash          # installs Bun
# Node: use nvm/fnm/volta, e.g.
nvm install 22.23.4 && nvm use 22.23.4
```

Windows: install Bun via `powershell -c "irm bun.sh/install.ps1|iex"` and Node from nodejs.org, or use WSL2 (recommended; all commands below then work unchanged).

> Keep the Bun binary **outside** the project folder. Never commit `node_modules`, `.env*` (except `.env.example`), `dist`, or `.expo`.

## 2. Get the code and install once

```bash
git clone <your-repo-url> campusops && cd campusops
bun install
```

`bun install` reads the single root `bun.lock` and installs dependencies for **every** workspace (`apps/api`, `apps/web`, `apps/mobile`, `packages/shared`). You do not run `npm install` inside each app. See [monorepo.md](monorepo.md).

## 3. Create a database

**Option A — Neon (no local Postgres needed).** Create a project at neon.tech, copy the *pooled* and *direct* connection strings.

**Option B — local Postgres 17.**

```bash
sudo -u postgres psql -c "CREATE ROLE campusops LOGIN PASSWORD 'campusops' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE campusops_dev OWNER campusops;"
sudo -u postgres psql -c "CREATE DATABASE campusops_test OWNER campusops;"
```

## 4. Fill `.env.local`

```bash
cp .env.example .env.local
```

Edit `.env.local` (it is git-ignored). Minimum for local demo review:

```ini
NODE_ENV=development
PORT=8787
WEB_ORIGIN=http://localhost:5173
APP_BASE_URL=http://localhost:5173
DATABASE_URL=postgresql://campusops:campusops@127.0.0.1:5432/campusops_dev
TEST_DATABASE_URL=postgresql://campusops:campusops@127.0.0.1:5432/campusops_test
JWT_ACCESS_SECRET=<openssl rand -hex 32>
REFRESH_TOKEN_PEPPER=<openssl rand -hex 32>
DEMO_MODE=true
EMAIL_MODE=demo
EXPOSE_DEMO_OTP=true
STORAGE_MODE=disabled
SEED_DEMO_PASSWORD=Any-Local-Password-123!
```

Generate the two secrets with `openssl rand -hex 32` (two different values). Full reference: [environment.md](environment.md).

**How the API finds this file:** Bun automatically loads `.env.local` from the directory it is started in. The root scripts start the API through `bun run --filter`, which runs in `apps/api`; therefore also create a symlink so both locations resolve to the same file:

```bash
ln -s ../../.env.local apps/api/.env.local     # macOS/Linux
# Windows (PowerShell, admin): New-Item -ItemType SymbolicLink -Path apps/api/.env.local -Target ../../.env.local
```

Alternatively export the variables in your shell: `set -a; . ./.env.local; set +a`.

## 5. Migrate and (optionally) seed

```bash
bun run db:migrate      # applies apps/api/src/db/migrations/0001…0007 in order, tracked in schema_migrations
bun run db:seed         # fake demo institution; enables demo logins only if SEED_DEMO_PASSWORD is set
bun run db:check        # prints Postgres version, table count, applied migrations
```

Seeding is idempotent (fixed UUIDs, `ON CONFLICT DO NOTHING`). It never runs in production unless you run it, and demo passwords are refused when `NODE_ENV=production`.

## 6. Run the apps

Open three terminals (all from the repo root):

```bash
bun run dev:api       # API on http://localhost:8787  (hot reload)
bun run dev:web       # Management website on http://localhost:5173 (proxies /api → 8787)
```

**Mobile browser preview** (no phone needed):

```bash
bun run build:mobile:web                    # static Expo export → apps/mobile/dist
PORT=8081 bun run preview:mobile            # serves it and proxies /api → 8787
```

**Mobile on a phone / emulator:**

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8787 npx expo start
```

Scan the QR with Expo Go (same Wi‑Fi). `localhost` on a phone means the phone itself, so use your computer's LAN IP. See [mobile.md](mobile.md).

## 7. Sign in

Demo accounts (password = your `SEED_DEMO_PASSWORD`):

| Role | Email |
|---|---|
| Admin (Principal) | `principal@demo.campusops.local` |
| HOD/Dean | `hoddean.cse@demo.campusops.local` |
| Faculty | `faculty.cse@demo.campusops.local` |
| Club lead (coordinator) | `coding.lead@demo.campusops.local` |
| Verified college student (mobile) | `student.verified@demo.campusops.local` |
| Outside student (mobile) | `outsider@demo.campusops.local` |

The website is **management-only**. Students sign in on the mobile app; a student without a staff role or club membership is told to use the app.

## 8. Verify everything

```bash
bun run check          # lint + typecheck (all workspaces)
bun run test           # 260 API tests against TEST_DATABASE_URL
bun run build:web      # production website build
E2E_PASSWORD="$SEED_DEMO_PASSWORD" bun run e2e:all       # real-browser walkthroughs (API + web running)
E2E_PASSWORD="$SEED_DEMO_PASSWORD" bun run e2e:mobile    # mobile preview running on :8081
```

Details and how to add tests: [testing.md](testing.md).

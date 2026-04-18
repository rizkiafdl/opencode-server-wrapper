# OpenWiki

A self-hosted, multi-user AI workspace — browser-based chat powered by opencode's HTTP API, with git worktree isolation per user and an admin dashboard for merge queue, session monitoring, and branch aggregation.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.11+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| git | 2.30+ | `git --version` |
| opencode | latest | `opencode --version` |

---

## Install opencode

opencode is the AI execution layer. Install it once globally:

```bash
# macOS / Linux via npm (recommended)
npm install -g opencode-ai

# Or via Homebrew (macOS)
brew install sst/tap/opencode

# Verify
opencode --version
```

> **API keys required.** opencode reads provider keys from environment variables.
> Set at least one before starting:
>
> ```bash
> export ANTHROPIC_API_KEY=sk-ant-xxx
> # or
> export OPENAI_API_KEY=sk-xxx
> # or any other provider — see https://opencode.ai/docs/providers/
> ```

---

## Local Dev Setup (no Docker)

This is the fastest way to run everything on your machine.

### 1. Clone and install dependencies

```bash
git clone <this-repo> openwiki
cd openwiki

# Python backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# React frontend
cd frontend
npm install
npm run build      # builds to frontend/dist/ — served by FastAPI
cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — minimum required:

```env
# Your git repo (OpenWiki will clone this as the base repo)
REPO_URL=https://github.com/your-org/your-repo
GITHUB_TOKEN=ghp_xxx          # for git HTTPS push auth

# Point FastAPI to local opencode instances (same machine)
OPENCODE_USER_URL=http://localhost:4096
OPENCODE_ADMIN_URL=http://localhost:4097

# AI provider key (picked up by opencode)
ANTHROPIC_API_KEY=sk-ant-xxx

# Local data paths (created automatically)
DB_PATH=./data/opencode.db
REPO_PATH=./repos/base
WORKTREES_PATH=./worktrees
SKILLS_PATH=./opencode-config/skills
```

### 3. Start the opencode servers

OpenWiki needs **two** opencode instances running. Open two terminal tabs:

**Terminal 1 — user instance (handles all chat sessions)**
```bash
export ANTHROPIC_API_KEY=sk-ant-xxx    # or whichever provider
opencode serve --port 4096 --hostname 0.0.0.0
```

**Terminal 2 — admin instance (aggregator + quality-check jobs)**
```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
opencode serve --port 4097 --hostname 0.0.0.0
```

You should see:
```
opencode server listening on http://0.0.0.0:4096
```

Verify both are healthy:
```bash
curl http://localhost:4096/global/health   # → {"healthy": true}
curl http://localhost:4097/global/health   # → {"healthy": true}
```

### 4. Start the FastAPI server

```bash
# activate venv if not already active
source .venv/bin/activate

uvicorn main:app --reload --port 8000
```

### 5. (Optional) Frontend dev server with HMR

If you want live-reload on frontend changes instead of rebuilding:

```bash
# Terminal 3
cd frontend
npm run dev      # starts on http://localhost:5173
                 # proxies /api/* to http://localhost:8000
```

Then open `http://localhost:5173` instead of `:8000`.

### 6. Open the app

```
http://localhost:8000
```

Enter a username → **Start Session** → chat.

---

## Docker Compose Setup (production / team)

Runs everything in containers — no local opencode install needed.

### 1. Configure env

```bash
cp .env.example .env
# Edit .env — set REPO_URL, GITHUB_TOKEN, ANTHROPIC_API_KEY
```

### 2. Build frontend

```bash
cd frontend && npm install && npm run build && cd ..
```

### 3. Start all services

```bash
docker compose up -d
```

This starts:
- `fastapi` on port 8000
- `opencode-user` on port 4096 (all user chat sessions)
- `opencode-admin` on port 4097 (aggregator + quality-check jobs)

```bash
docker compose logs -f           # stream all logs
docker compose logs -f fastapi   # FastAPI only
docker compose ps                # service status

docker compose restart opencode-user   # restart user instance
docker compose down                    # stop everything
```

Open `http://localhost:8000`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENCODE_USER_URL` | `http://localhost:4096` | URL of the user opencode instance |
| `OPENCODE_ADMIN_URL` | `http://localhost:4097` | URL of the admin opencode instance |
| `OPENCODE_USER_PASSWORD` | — | Password for opencode-user (if set) |
| `OPENCODE_ADMIN_PASSWORD` | — | Password for opencode-admin (if set) |
| `ANTHROPIC_API_KEY` | — | Forwarded to opencode containers |
| `OPENAI_API_KEY` | — | Forwarded to opencode containers |
| `REPO_URL` | — | Git remote URL (HTTPS or SSH) |
| `GITHUB_TOKEN` | — | Token for git HTTPS push auth |
| `DB_PATH` | `./data/opencode.db` | SQLite database path |
| `REPO_PATH` | `./repos/base` | Base git clone path |
| `WORKTREES_PATH` | `./worktrees` | Root dir for user git worktrees |
| `SKILLS_PATH` | `./opencode-config/skills` | Skills markdown files directory |
| `IDLE_TIMEOUT_MIN` | `15` | Minutes before idle session is reaped |
| `LOG_LEVEL` | `INFO` | `DEBUG` to see raw SSE chunks |
| `FRONTEND_DIST` | `frontend/dist` | Path to built React app |

---

## Architecture

```
Browser
  │ HTTP / SSE
  ▼
FastAPI (port 8000)            — session CRUD, SSE proxy, git ops, admin API
  │                    │
  ▼                    ▼
opencode-user         opencode-admin
(port 4096)           (port 4097)
all chat sessions     aggregator + quality-check jobs
  │
  ▼
Git Layer
  repos/base/          — shared base clone (main branch)
  worktrees/alice/     — alice's isolated worktree (branch: user/alice)
  worktrees/bob/       — bob's isolated worktree  (branch: user/bob)
  worktrees/agg-date/  — aggregator output worktree
```

---

## Admin Dashboard

Visit `/admin` after logging in.

| Tab | What it does |
|---|---|
| **Merge Queue** | Review pending user branches — inline diff view, approve (git merge) or reject |
| **Sessions** | Live table of active sessions — see username, model, idle time; force-kill any session |
| **Agents** | Live agent list from opencode (`GET /agents`) |
| **Aggregator** | Trigger cross-branch synthesis via the admin opencode instance |
| **Analysis** | Git activity metrics + NLP readability scores for the repo |

---

## Team Config (opencode customization)

Put files in `opencode-config/` — they are mounted into both opencode containers:

```
opencode-config/
├── AGENTS.md          # system context loaded in every session
├── opencode-user.json # user instance config (permissions, model)
├── opencode-admin.json# admin instance config
├── agents/            # custom agent definitions (.md files)
├── skills/            # skills loaded on-demand by agents (.md files)
└── commands/          # slash commands (.md files)
```

See [.context/opencode-customization-guide.md](.context/opencode-customization-guide.md) for full details.

---

## Out of Scope (v1)

- Authentication / passwords (username trust model)
- HTTPS / TLS (use a reverse proxy — nginx/Caddy)
- Real-time collaborative editing
- GitHub OAuth / SSO
- Billing / multi-tenancy

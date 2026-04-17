# OpenCode Multi-User Session Manager

A local MVP that manages multiple `opencode serve` processes. Each user gets
an isolated git worktree and a dedicated opencode process. Users interact
through a browser-based chat UI running on a single machine.

---

## Prerequisites

- Python 3.11+
- [`opencode`](https://opencode.ai) binary on `PATH` (run `opencode --version` to verify)
- `git` 2.30+ (for `git worktree` support)
- A GitHub repository the machine has push access to (for branch persistence)

---

## Setup

```bash
# 1. Clone this repo
git clone <this-repo-url> opencode-manager
cd opencode-manager

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env — set REPO_URL and BASE_REPO_PATH at minimum

# 4. Start the server
uvicorn main:app --reload --port 8000

# 5. Open the UI
open http://localhost:8000
```

---

## Usage

1. Open `http://localhost:8000` in a browser.
2. Enter a username and click **Start Session**.
   - A git worktree (`user-<name>` branch) is created from the base repo.
   - An `opencode serve` process is started on a free port.
3. Type messages in the chat input and press **Enter** or **Send**.
4. Click **End Session** to push the branch and clean up the process.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REPO_URL` | — | Git remote URL to clone as the base repo |
| `BASE_REPO_PATH` | `/tmp/opencode-repos/base` | Local path for the base clone |
| `GITHUB_TOKEN` | — | Token used by git for HTTPS auth (set in env or via `gh auth`) |
| `HOST` | `0.0.0.0` | Bind address for uvicorn |
| `PORT` | `8000` | Bind port for uvicorn |
| `IDLE_TIMEOUT_MINUTES` | `15` | Minutes of inactivity before a session is reaped |
| `OPENCODE_BASE_PORT` | `4100` | Starting port for opencode processes (increments per user) |

---

## Architecture

```
Browser
  │
  │  HTTP / SSE
  ▼
FastAPI (port 8000)
  ├── POST /api/spawn/{user}     — creates worktree + spawns opencode
  ├── DELETE /api/teardown/{user}— pushes branch, kills process, removes worktree
  ├── GET  /api/status           — lists active sessions
  ├── GET  /proxy/{user}/event   — SSE stream (proxied from opencode)
  └── ANY  /proxy/{user}/**      — generic HTTP proxy to opencode
          │
          │  localhost:{port}
          ▼
      opencode serve  (one per user, port 4100+)
          │
          │  git worktree
          ▼
      /tmp/opencode-repos/
          ├── base/              — shared bare-ish clone (.git lives here)
          └── worktrees/
              ├── alice/         — branch: user-alice
              └── bob/           — branch: user-bob
```

### Key behaviours

- **One process per user** — each `opencode serve` gets its own port and
  process group so `SIGTERM` kills the whole tree.
- **Idle reaper** — a background asyncio task runs every 60 s and tears down
  sessions idle for more than `IDLE_TIMEOUT_MINUTES`.
- **Branch persistence** — on teardown the branch is pushed to remote before
  the worktree is removed, so work is never lost.
- **No auth for MVP** — usernames are trust-based; add authentication before
  any multi-tenant deployment.

---

## Out of scope (MVP)

- Authentication / passwords
- HTTPS / TLS
- Persistent message history in the browser (opencode stores this internally)
- Multiple repos per session
- PR / merge workflow automation
- Rate limiting or quota enforcement
- Horizontal / multi-machine scaling
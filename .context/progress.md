# OpenCode Multi-User Session Manager — Progress Log

**Date**: 2026-04-18  
**Status**: MVP Working ✓ — Product defined, implementation plan ready

## Related Docs
- [product-spec.md](product-spec.md) — PM perspective: vision, personas, user journeys, feature list
- [implementation-plan.md](implementation-plan.md) — Server/orchestrator: phase plan, code sketches, API endpoints, admin dashboard
- [wiki-layer.md](wiki-layer.md) — Wiki knowledge architecture: AGENTS.md template, directory structure, ingest/query/lint operations

---

## What Was Built

A local multi-user web interface that manages `opencode serve` processes.
Each user gets an isolated git worktree and a dedicated opencode process.
Users interact through a browser-based chat UI on a single machine.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11+ / FastAPI + uvicorn |
| Frontend | Vanilla HTML + JS (single file, no bundler) |
| Process management | Python `subprocess` + `os.killpg` |
| Git isolation | `git worktree` CLI |
| Streaming | SSE via FastAPI `StreamingResponse` + `httpx` |

---

## Project Structure

```
opencode-manager/
├── main.py               # FastAPI app — all backend logic
├── static/
│   └── index.html        # entire frontend, single file
├── .context/
│   └── progress.md       # this file
├── .env                  # GITHUB_TOKEN, REPO_URL, BASE_REPO_PATH (gitignored)
├── .env.example          # template
├── requirements.txt      # fastapi, uvicorn, python-dotenv, httpx
└── README.md
```

---

## Implemented Features

### Backend (`main.py`)

| Endpoint | Description |
|---|---|
| `POST /api/spawn/{username}` | Creates git worktree + spawns `opencode serve`, polls health |
| `DELETE /api/teardown/{username}` | Pushes branch, kills process group, removes worktree |
| `GET /api/status` | Lists all active sessions (username, port, branch, worktree, last_active) |
| `GET /proxy/{username}/event` | SSE stream proxy — streams opencode events to browser |
| `ANY /proxy/{username}/**` | Generic async HTTP proxy to the user's opencode process |

**Other backend behaviours:**
- Git worktree creation: checks if `user-{username}` branch exists on remote; checks out if yes, creates new branch if no
- Health check: polls `GET /localhost:{port}/global/health` up to 10s before returning to client
- Idle reaper: asyncio background task, runs every 60s, tears down sessions idle > 15 min
- Process isolation: each opencode spawned with `os.setsid` (new process group) so `os.killpg` kills all children
- `LOG_LEVEL` env var controls log verbosity (`DEBUG` shows raw SSE chunks)

### Frontend (`static/index.html`)

- Login form → `POST /api/spawn/{username}` → stores username in `localStorage`
- Auto-reconnect on page load: checks `/api/status` to verify session is alive
- If session gone (e.g. server restarted), automatically redirects back to login
- SSE connection via `EventSource` — streams assistant tokens in real time
- Creates opencode session lazily on first message send, reuses `sessionID` after
- End Session button → `DELETE /api/teardown` → clears state, shows login
- Collapsible status panel: shows port, branch, worktree, last active — polls every 10s

---

## Key Bug Fixes Applied

### 1. `WORKTREES_DIR` resolving to `/worktrees` (read-only filesystem error)
**Cause**: `BASE_REPO_PATH=/tmp` — `os.path.dirname("/tmp")` returns `/`  
**Fix**: Changed `.env` to `BASE_REPO_PATH=/tmp/opencode-repos/base`; added guard in code to handle root-parent edge case; added optional `WORKTREES_PATH` env override

### 2. SSE stream not delivering responses (long wait after sending message)
**Cause**: Missing anti-buffering headers on the `StreamingResponse`  
**Fix**: Added `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive` to the SSE proxy response

### 3. 404 retry loop on browser after server restart
**Cause**: uvicorn `--reload` wipes in-memory sessions; browser `EventSource` retried `/proxy/{user}/event` endlessly  
**Fix**: Before opening `EventSource`, probe `/api/status` first; after 3 consecutive SSE errors, re-check status and redirect to login if session is gone

### 4. Frontend event parser mismatch (messages sent but no text in UI)
**Cause**: Frontend was looking for opencode's assumed event format (`type:"part"`, `message.completed`) which does not match the actual opencode SSE protocol  
**Actual opencode SSE event format** (discovered via `LOG_LEVEL=DEBUG`):

| Event type | Meaning | Relevant field |
|---|---|---|
| `message.part.delta` | Streaming text token | `properties.delta` (when `properties.field === "text"`) |
| `session.idle` | Response complete | — |
| `session.status` | Session busy/idle | `properties.status.type` |
| `message.part.updated` | Full part snapshot | `properties.part` |
| `server.heartbeat` | Keep-alive ping | — |
| `server.connected` | SSE connection established | — |

**Fix**: Rewrote `handleSSEMessage()` to use `message.part.delta` for token streaming and `session.idle` as the completion signal

---

## Environment Variables

| Variable | Example value | Description |
|---|---|---|
| `REPO_URL` | `https://github.com/org/repo` | Git remote to clone as base repo |
| `BASE_REPO_PATH` | `/tmp/opencode-repos/base` | Local path for the base clone (must be a subdirectory, not `/tmp` itself) |
| `GITHUB_TOKEN` | `ghp_xxx` | Token for git HTTPS auth |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8000` | Bind port |
| `IDLE_TIMEOUT_MINUTES` | `15` | Idle session reap timeout |
| `OPENCODE_BASE_PORT` | `4100` | Starting port for opencode processes |
| `WORKTREES_PATH` | *(optional)* | Override default worktrees directory |
| `LOG_LEVEL` | `INFO` / `DEBUG` | Set to `DEBUG` to see raw SSE chunks |

---

## How to Run

```bash
# Install dependencies
pip install -r requirements.txt

# Configure
cp .env.example .env
# edit .env — set REPO_URL, BASE_REPO_PATH, GITHUB_TOKEN

# Start
uvicorn main:app --reload --port 8000

# Open
open http://localhost:8000
```

---

## Out of Scope (MVP)

- Authentication / passwords
- HTTPS / TLS
- Persistent message history in the browser (opencode stores this internally)
- Multiple repos per session
- PR / merge workflow automation
- Rate limiting
- Horizontal / multi-machine scaling

---

## Known Limitations

- Sessions are in-memory only — a server restart loses all session state; users must log in again
- `--reload` flag in development triggers restarts on file changes, clearing sessions
- No authentication — any username can start a session
- GitHub token stored in `.env` — ensure `.env` is in `.gitignore`
# OpenWiki — Progress Log

**Date**: 2026-04-18
**Status**: Phase 1 + Phase 2 BUILT ✓ — Full stack end-to-end

## Related Docs
- [product-spec.md](product-spec.md) — PM perspective: vision, personas, user journeys
- [implementation-plan.md](implementation-plan.md) — Full technical implementation plan (v0.3)
- [opencode-customization-guide.md](opencode-customization-guide.md) — OpenCode surfaces guide

---

## Architecture

```
Browser → FastAPI (port 8000) → opencode-user (port 4096) [user chat sessions]
                              → opencode-admin (port 4097) [aggregator + quality-check]
                              → SQLite (/data/opencode.db)
                              → Git layer (gitpython + subprocess)
```

**Session management**: Docker Compose, 2 shared opencode instances (not per-user subprocess).

---

## Project Structure

```
paralel-opencode-webserver/
├── main.py                   # FastAPI — 30 API routes, Phase 1 + Phase 2 complete
├── db.py                     # SQLite layer (aiosqlite) — 6 tables
├── opencode_client.py        # httpx clients for opencode-user and opencode-admin
├── git_ops.py                # git worktree, branch, merge, activity ops
├── requirements.txt          # fastapi, uvicorn, httpx, aiosqlite, gitpython, textstat
├── Dockerfile                # FastAPI container
├── docker-compose.yml        # fastapi + opencode-user + opencode-admin
├── .env.example              # env var template
├── opencode-config/
│   ├── AGENTS.md             # shared system context for all sessions
│   ├── opencode-user.json    # user instance config (permissions)
│   ├── opencode-admin.json   # admin instance config (wider permissions)
│   ├── skills/               # skill .md files (mount into opencode containers)
│   ├── agents/               # agent .md files
│   └── commands/             # slash command .md files
└── frontend/                 # React 18 + Vite SPA
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx            # Router: /login /chat /sessions /skills /admin
        ├── store/session.ts   # Zustand (username, sessionId, model, agent)
        ├── api/
        │   ├── client.ts      # fetch wrapper
        │   ├── sessions.ts    # TanStack Query hooks
        │   ├── agents.ts      # agents + providers hooks
        │   ├── admin.ts       # merge queue, aggregator, analysis hooks
        │   └── sse.ts         # EventSource hook with rAF batching
        ├── components/
        │   ├── chat/
        │   │   ├── ChatContainer.tsx   # TanStack Virtual message list
        │   │   ├── MessageBubble.tsx   # react-markdown + memo
        │   │   ├── MessageInput.tsx    # textarea + send button
        │   │   ├── AgentPicker.tsx     # dropdown from GET /api/agents
        │   │   └── ModelPicker.tsx     # dropdown from GET /api/providers
        │   └── admin/
        │       ├── MergeQueue.tsx      # diff preview + approve/reject
        │       ├── SessionMonitor.tsx  # live session table + kill
        │       ├── AgentRegistry.tsx   # live agent list
        │       ├── Aggregator.tsx      # trigger + job history
        │       └── RepoAnalysis.tsx    # NLP metrics + activity table
        └── pages/
            ├── Login.tsx      # username form → start session
            ├── Chat.tsx       # main chat UI with topbar
            ├── Sessions.tsx   # active sessions list
            ├── Skills.tsx     # skill browser with markdown viewer
            └── Admin.tsx      # tabbed admin dashboard (5 tabs)
```

---

## API Routes (all verified)

### Session
| Route | Method | Description |
|---|---|---|
| `/api/session/start` | POST | Create worktree + opencode session |
| `/api/session/end` | POST | Commit + push + add to merge queue |
| `/api/session/me` | GET | Current user's active session |
| `/api/session/list` | GET | All active sessions |
| `/api/session/{id}/touch` | POST | Update last_active |

### Chat
| Route | Method | Description |
|---|---|---|
| `/api/chat/sse` | GET | SSE proxy from opencode-user → browser |
| `/api/chat/{id}/message` | POST | Send message to opencode session |

### Agents/Providers/Skills
| Route | Method | Description |
|---|---|---|
| `/api/agents` | GET | Live from opencode-user GET /agents |
| `/api/providers` | GET | Live from opencode-user GET /providers |
| `/api/skills` | GET | Filesystem scan of /skills/ |
| `/api/skills/{id}` | GET | Full skill markdown content |

### Admin
| Route | Method | Description |
|---|---|---|
| `/api/admin/sessions` | GET | All active sessions |
| `/api/admin/sessions/{user}` | DELETE | Kill session |
| `/api/admin/queue` | GET | Merge queue by status |
| `/api/admin/queue/{id}/diff` | GET | Full git diff |
| `/api/admin/queue/{id}/approve` | POST | git merge + push |
| `/api/admin/queue/{id}/reject` | POST | Delete remote branch |
| `/api/admin/aggregate` | POST | Trigger aggregation |
| `/api/admin/aggregate` | GET | List aggregation jobs |
| `/api/admin/aggregate/{id}/sse` | GET | SSE stream for aggregation progress |
| `/api/admin/analysis/activity` | GET | User activity from git log |
| `/api/admin/analysis/nlp` | GET | textstat NLP metrics |
| `/api/admin/analysis/quality-check` | POST | Agent-based quality check |
| `/api/admin/config` | GET/POST | Platform config key-value |
| `/api/health` | GET | Health of both opencode instances |

---

## How to Run

### Local dev (without Docker, opencode running separately)

```bash
# 1. Install Python deps
pip install -r requirements.txt

# 2. Start opencode instances manually (two terminal tabs)
opencode serve --port 4096
opencode serve --port 4097

# 3. Configure env
cp .env.example .env
# Edit .env — set REPO_URL, GITHUB_TOKEN, OPENCODE_USER_URL=http://localhost:4096

# 4. Build frontend (once, or run dev server separately)
cd frontend && npm install && npm run build && cd ..

# 5. Start FastAPI
uvicorn main:app --reload --port 8000

# 6. Or run frontend dev server with HMR
cd frontend && npm run dev   # port 5173, proxied to :8000
```

### Docker Compose (production)

```bash
cp .env.example .env
# Edit .env with API keys and REPO_URL

docker compose up -d
open http://localhost:8000
```

---

## Phase Completion Status

| Phase | Status |
|---|---|
| **Phase 1 — Core Platform** | ✅ Complete |
| **Phase 2 — Admin Basics** | ✅ Complete |
| **Phase 3 — Branch Aggregator** | ✅ Backend complete, UI complete |
| **Phase 4 — Repo Analysis** | ✅ Activity + NLP backend, UI complete. Quality-check endpoint stub |
| **Phase 5 — Skills & Provider Mgmt** | 🔶 Skills browser complete, provider config UI pending |

---

## SQLite Schema

```sql
sessions         — id, username, worktree, branch, model, agent, created_at, last_active, status
merge_queue      — id, username, branch, session_id, pushed_at, diff_stat, status
aggregations     — id, triggered_by, triggered_at, since_date, branches_read, output_branch, opencode_session, status
analysis_snapshots — id, repo_path, snapshot_at, word_count, readability, file_count, quality_json
config           — key, value
skills           — id, name, description, file_path, updated_at
```

---

## Known Limitations

- No authentication — username trust model (by design, v1)
- opencode API shape varies by version — SSE event parsing may need adjustment
- `frontend/dist/` must be pre-built before `docker compose up` (or add a build step to Dockerfile)
- Provider Config UI (admin) not yet built — edit `opencode-config/opencode-user.json` manually

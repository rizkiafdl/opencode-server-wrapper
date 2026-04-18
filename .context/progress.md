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

## Bug Fixes (2026-04-18)

### Debugging session: chat UI showed nothing after sending a message

All bugs were found by live testing — sending a real message through the UI and reading raw server logs and SSE captures.

---

### Bug 1 — Wrong opencode SSE endpoint path
**Symptom:** Server log showed 200+ reconnects per second:
```
INFO main SSE feed: connected to opencode-user
INFO httpx HTTP Request: GET http://localhost:4096/sse "HTTP/1.1 200 OK"
INFO main SSE feed: connected to opencode-user   ← immediately again
INFO httpx HTTP Request: GET http://localhost:4096/sse "HTTP/1.1 200 OK"
... (repeating ~150 times per second)
```
**Root cause:** `opencode_client.py` and `main.py` were hitting `/sse`. That path serves opencode's own web UI (HTML). `aiter_lines()` reads the HTML body, exhausts immediately (no SSE events), returns cleanly with no exception — so the `while True` reconnect loop had zero delay.
**How to verify:** `curl -s http://localhost:4096/sse` returns a full HTML page. `curl -s -I http://localhost:4096/event` returns `Content-Type: text/event-stream`.
**Fix:** Changed `/sse` → `/event` in both `opencode_client.py` (`stream_user_sse`, `stream_admin_sse`) and `main.py` (`_run_sse_feed`).

---

### Bug 2 — No sleep on normal stream exit (amplified Bug 1)
**Symptom:** Same flood as Bug 1. The sleep only fired on exceptions, not on a clean stream close.
**Root cause:** `_run_sse_feed()` structure was:
```python
while True:
    try:
        async with client.stream(...) as resp:
            async for line in resp.aiter_lines():
                ...
        # ← stream exhausted cleanly, falls through to next loop iteration IMMEDIATELY
    except asyncio.CancelledError:
        return
    except Exception as exc:
        await asyncio.sleep(2)  # only sleeps on error, not on clean close
```
When `/sse` returned HTML and closed, no exception was raised — so it reconnected in microseconds.
**Fix:** Added `await asyncio.sleep(2)` after the `try` block (outside the except) so any clean stream exit also waits before reconnecting. Also added exponential backoff (`min(2 * 2**retry, 30)`) for error cases.

---

### Bug 3 — SSE event boundary (empty lines) stripped by accident
**Symptom:** Even after fixing the path, browser received no events despite the SSE stream being open.
**Root cause:** SSE wire format uses a blank line to signal end-of-event to the browser:
```
data: {"type":"message.part.delta",...}\n
\n                                         ← blank line = "dispatch this event"
```
`aiter_lines()` strips trailing `\n` from each line and yields an empty string `""` for the blank line. The original code had:
```python
async for line in resp.aiter_lines():
    if not line:
        continue  # ← was discarding the blank line!
    text = line + "\n"
    ...
```
So the browser received `data: {...}\n` but never the terminating `\n`. Browser's `EventSource` never fires `onmessage` because the event is never terminated.
**Fix:** Removed `if not line: continue`. Empty lines now pass through as `"\n"`, giving the browser the required `data: {...}\n\n` double-newline boundary.

---

### Bug 4 — SSE fan-out: per-request connections to opencode accumulated
**Symptom:** Every browser `EventSource` reconnect spawned a new persistent `httpx` streaming connection to opencode `/event`. These never closed.
**Root cause:** The original `/api/chat/sse` route opened its own `httpx.AsyncClient` stream on every request:
```python
@app.get("/api/chat/sse")
async def chat_sse():
    async def stream():
        async for chunk in oc.stream_user_sse():  # new connection per browser tab
            yield chunk
    return StreamingResponse(stream(), ...)
```
**Fix:** Replaced with fan-out architecture:
- `_sse_subscribers: set[asyncio.Queue]` — global set of per-browser queues
- `_run_sse_feed()` — ONE background task holding the single persistent opencode connection; distributes each line to all subscriber queues
- `/api/chat/sse` — creates a `Queue(maxsize=256)`, adds to set, drains it, removes on disconnect
- 15-second `asyncio.wait_for` timeout sends `: keepalive\n\n` SSE comment to prevent proxy/browser timeout

---

### Bug 5 — `/api/agents` and `/api/providers` returning 502
**Symptom:**
```
INFO httpx HTTP Request: GET http://localhost:4096/agents "HTTP/1.1 200 OK"
INFO: "GET /api/agents HTTP/1.1" 502 Bad Gateway
```
**Root cause:** opencode returns 200 but the response body may not be a plain JSON array. `r.json()` either failed to parse or FastAPI's automatic serialization of the returned Python object threw an error for an unexpected shape.
**Fix:** Replaced `get_agents()` / `get_providers()` (which called `r.json()`) with `get_agents_raw()` / `get_providers_raw()` that return `(status_code: int, body: bytes)`. Routes now use `Response(content=bytes, media_type="application/json", status_code=status)` — raw byte pass-through, zero re-serialization.

---

### Bug 6 — Non-streaming models render nothing (Frontend)
**Symptom:** SSE proxy delivering events correctly. No errors in logs. But chat UI still blank after sending a message.
**Root cause:** The model in use (`minimax-m2.5-free`) does **not stream**. It skips `message.part.delta` entirely and delivers the full assistant text as a single `message.part.updated` event at the end.

Confirmed by capturing raw events with `curl -s http://localhost:4096/event` while sending a message. No `message.part.delta` appeared. The full flow was:
```
message.updated        { role: "user", id: "msg_aaa" }
message.part.updated   { part: { type: "text", text: "say hi", messageID: "msg_aaa" } }
session.status         { status: { type: "busy" } }
message.updated        { role: "assistant", id: "msg_bbb" }   ← no delta follows
message.part.updated   { part: { type: "text", text: "Hi!", messageID: "msg_bbb" } }  ← full text here
session.idle
```

`sse.ts` only handled `message.part.delta`. For non-streaming models, that event never fires, so nothing rendered.

**Fix in `frontend/src/api/sse.ts`:**
1. Added `message.updated` handler: when `info.role === "assistant"`, stores `info.id` in `assistantMsgIdsRef` (a `Set<string>` ref).
2. Added `message.part.updated` handler: when `part.messageID` is in `assistantMsgIdsRef` AND `part.type === "text"` AND `part.text !== ""`, renders the full text — replacing any partial streaming text already in the message bubble.
3. Kept `message.part.delta` handler intact — streaming models still work correctly. Both paths coexist.

**Key insight:** `message.part.updated` fires for both user and assistant parts. The `assistantMsgIdsRef` set is the discriminator — only parts whose `messageID` was previously seen in a `message.updated { role: "assistant" }` event are rendered.

---

### opencode SSE event reference (v1.4.1, verified live)

| Event type | When fired | Key fields in `properties` |
|---|---|---|
| `server.connected` | On SSE connect | — |
| `server.heartbeat` | Periodic keepalive | — |
| `session.updated` | Session metadata changes | `sessionID`, `info` |
| `session.status` | Status change | `sessionID`, `status.type` (`"busy"` / `"idle"`) |
| `session.idle` | Session finishes responding | `sessionID` |
| `session.diff` | File diff available | `sessionID`, `diff` |
| `message.updated` | Message created or updated | `sessionID`, `info.id`, `info.role` (`"user"` / `"assistant"`) |
| `message.part.updated` | Full part text finalized | `sessionID`, `part.messageID`, `part.type`, `part.text` |
| `message.part.delta` | Streaming text chunk | `sessionID`, `messageID`, `partID`, `field` (`"text"`/`"reasoning"`), `delta` |

**Non-streaming models** (e.g. `minimax-m2.5-free`): emit `message.part.updated` only, skip `message.part.delta`.
**Streaming models** (e.g. Claude, GPT-4o): emit many `message.part.delta` events, followed by a final `message.part.updated`.

---

---

### Performance Issue — slow chat responses (2026-04-18)

**Symptom:** Chat takes ~30s to respond to "say hi". TUI on same machine is fast.

**Root cause — wrong opencode working directory**

opencode server uses its **CWD at startup** as the project context for every session. There is no API parameter to override this per-session (passing `directory` or `path` to `POST /session` is silently ignored). Every message includes all files in that directory as context tokens.

When started from `/paralel-opencode-webserver`, opencode indexed **2,652 files → 9,560 input tokens per message**. The TUI was fast because the user ran it from a smaller project directory.

**Verified by:**
- POST response showed `"input": 9560` tokens for a 3-word message
- `find . -not -path "*/node_modules/*" ...` counted 2,652 indexable files in the project root
- TUI started from a different directory → far fewer tokens → fast response

**Fix:**
- `docker-compose.yml`: added `working_dir: /worktrees` to `opencode-user` and `working_dir: /repos/base` to `opencode-admin`
- `README.md`: updated local dev instructions to explicitly `cd worktrees` before starting opencode-user, and `cd repos/base` before starting opencode-admin
- Also added `./repos:/repos` volume mount to both opencode containers (was missing)

**Rule for future:** always start `opencode serve` from the directory that represents the user's actual working context — not the web server project root.

---

## Known Limitations

- No authentication — username trust model (by design, v1)
- `frontend/dist/` must be pre-built before `docker compose up` (or add a build step to Dockerfile)
- Provider Config UI (admin) not yet built — edit `opencode-config/opencode-user.json` manually
- If opencode upgrades its SSE event schema, check the event reference table above and update `sse.ts` handlers accordingly

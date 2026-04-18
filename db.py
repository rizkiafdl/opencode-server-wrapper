import aiosqlite
import json
import os
from datetime import datetime, timezone

DB_PATH = os.environ.get("DB_PATH", "./data/opencode.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    worktree    TEXT NOT NULL,
    branch      TEXT NOT NULL,
    model       TEXT,
    agent       TEXT,
    created_at  TEXT NOT NULL,
    last_active TEXT NOT NULL,
    status      TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS merge_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL,
    branch      TEXT NOT NULL,
    session_id  TEXT,
    pushed_at   TEXT NOT NULL,
    diff_stat   TEXT,
    status      TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS aggregations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    triggered_by     TEXT NOT NULL,
    triggered_at     TEXT NOT NULL,
    since_date       TEXT NOT NULL,
    branches_read    TEXT,
    output_branch    TEXT,
    opencode_session TEXT,
    status           TEXT DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS analysis_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_path    TEXT NOT NULL,
    snapshot_at  TEXT NOT NULL,
    word_count   INTEGER,
    readability  REAL,
    file_count   INTEGER,
    quality_json TEXT
);

CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    file_path   TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

INSERT OR IGNORE INTO config (key, value) VALUES
    ('idle_timeout_min', '15'),
    ('aggregator_timeout_sec', '600');
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def init_db() -> None:
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def _get(query: str, params: tuple = ()) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, params) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def _all(query: str, params: tuple = ()) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, params) as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def _run(query: str, params: tuple = ()) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(query, params)
        await db.commit()
        return cur.lastrowid


# ── Sessions ──────────────────────────────────────────────────────────────────

async def insert_session(id: str, username: str, worktree: str, branch: str,
                          model: str | None = None, agent: str | None = None) -> None:
    now = _now()
    await _run(
        "INSERT OR REPLACE INTO sessions (id, username, worktree, branch, model, agent, created_at, last_active, status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')",
        (id, username, worktree, branch, model, agent, now, now),
    )


async def get_session(session_id: str) -> dict | None:
    return await _get("SELECT * FROM sessions WHERE id=?", (session_id,))


async def get_session_by_user(username: str) -> dict | None:
    return await _get(
        "SELECT * FROM sessions WHERE username=? AND status='active' ORDER BY created_at DESC LIMIT 1",
        (username,),
    )


async def list_sessions(status: str = "active") -> list[dict]:
    return await _all("SELECT * FROM sessions WHERE status=? ORDER BY last_active DESC", (status,))


async def touch_session(session_id: str) -> None:
    await _run("UPDATE sessions SET last_active=? WHERE id=?", (_now(), session_id))


async def end_session(session_id: str) -> None:
    await _run("UPDATE sessions SET status='ended', last_active=? WHERE id=?", (_now(), session_id))


async def get_idle_sessions(cutoff_iso: str) -> list[dict]:
    return await _all(
        "SELECT * FROM sessions WHERE status='active' AND last_active < ?", (cutoff_iso,)
    )


# ── Merge Queue ───────────────────────────────────────────────────────────────

async def insert_merge_queue(username: str, branch: str, session_id: str | None, diff_stat: str) -> int:
    return await _run(
        "INSERT INTO merge_queue (username, branch, session_id, pushed_at, diff_stat, status) "
        "VALUES (?, ?, ?, ?, ?, 'pending')",
        (username, branch, session_id, _now(), diff_stat),
    )


async def get_merge_queue(status: str = "pending") -> list[dict]:
    return await _all("SELECT * FROM merge_queue WHERE status=? ORDER BY pushed_at DESC", (status,))


async def get_merge_queue_item(id: int) -> dict | None:
    return await _get("SELECT * FROM merge_queue WHERE id=?", (id,))


async def update_merge_queue_status(id: int, status: str) -> None:
    await _run("UPDATE merge_queue SET status=? WHERE id=?", (status, id))


# ── Aggregations ──────────────────────────────────────────────────────────────

async def insert_aggregation(triggered_by: str, since_date: str,
                              branches: list[str], opencode_session: str) -> int:
    return await _run(
        "INSERT INTO aggregations (triggered_by, triggered_at, since_date, branches_read, opencode_session, status) "
        "VALUES (?, ?, ?, ?, ?, 'running')",
        (triggered_by, _now(), since_date, json.dumps(branches), opencode_session),
    )


async def update_aggregation(id: int, status: str, output_branch: str | None = None) -> None:
    if output_branch:
        await _run(
            "UPDATE aggregations SET status=?, output_branch=? WHERE id=?",
            (status, output_branch, id),
        )
    else:
        await _run("UPDATE aggregations SET status=? WHERE id=?", (status, id))


async def get_aggregation(id: int) -> dict | None:
    return await _get("SELECT * FROM aggregations WHERE id=?", (id,))


async def list_aggregations() -> list[dict]:
    return await _all("SELECT * FROM aggregations ORDER BY triggered_at DESC LIMIT 20")


# ── Config ────────────────────────────────────────────────────────────────────

async def get_config(key: str) -> str | None:
    row = await _get("SELECT value FROM config WHERE key=?", (key,))
    return row["value"] if row else None


async def set_config(key: str, value: str) -> None:
    await _run("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, value))


async def all_config() -> dict:
    rows = await _all("SELECT key, value FROM config")
    return {r["key"]: r["value"] for r in rows}

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# load_dotenv() MUST run before local module imports so env vars are
# set before git_ops/db/opencode_client read them at module level.
load_dotenv()

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db
import git_ops
import opencode_client as oc

logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger(__name__)

IDLE_TIMEOUT_MIN = int(os.environ.get("IDLE_TIMEOUT_MIN", "15"))
SKILLS_PATH = os.environ.get("SKILLS_PATH", "/skills")
FRONTEND_DIST = os.environ.get("FRONTEND_DIST", "frontend/dist")


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    git_ops.ensure_base_repo()
    reaper = asyncio.create_task(_idle_reaper())
    health = asyncio.create_task(_health_monitor())
    sse_feed = asyncio.create_task(_run_sse_feed())
    log.info("OpenWiki started")
    yield
    reaper.cancel()
    health.cancel()
    sse_feed.cancel()


app = FastAPI(title="OpenWiki", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── SSE fan-out state ─────────────────────────────────────────────────────────

_sse_subscribers: set[asyncio.Queue] = set()


async def _run_sse_feed() -> None:
    """Single persistent connection to opencode-user /sse; fans out to all browser subscribers."""
    retry = 0
    while True:
        try:
            async with httpx.AsyncClient(
                base_url=oc.OPENCODE_USER_URL,
                headers=oc._auth_header(oc.OPENCODE_USER_PASSWORD),
                timeout=httpx.Timeout(None),
            ) as client:
                async with client.stream("GET", "/event") as resp:
                    log.info("SSE feed: connected to opencode-user")
                    retry = 0
                    async for line in resp.aiter_lines():
                        text = line + "\n"
                        for q in list(_sse_subscribers):
                            try:
                                q.put_nowait(text)
                            except asyncio.QueueFull:
                                _sse_subscribers.discard(q)
            log.info("SSE feed: stream ended — reconnecting in 2s")
        except asyncio.CancelledError:
            return
        except Exception as exc:
            delay = min(2 * 2 ** retry, 30)
            log.warning("SSE feed error: %s — reconnecting in %ds", exc, delay)
            retry += 1
            await asyncio.sleep(delay)
            continue
        await asyncio.sleep(2)


# ── Background tasks ──────────────────────────────────────────────────────────

async def _idle_reaper() -> None:
    while True:
        await asyncio.sleep(60)
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=IDLE_TIMEOUT_MIN)).isoformat()
        idle = await db.get_idle_sessions(cutoff)
        for s in idle:
            log.info("Reaping idle session: %s (%s)", s["username"], s["id"])
            await _end_session_internal(s["id"], s["username"], s["worktree"], s["branch"])


async def _health_monitor() -> None:
    while True:
        await asyncio.sleep(30)
        user_ok = await oc.user_health()
        admin_ok = await oc.admin_health()
        if not user_ok:
            log.warning("opencode-user health check failed")
        if not admin_ok:
            log.warning("opencode-admin health check failed")


async def _end_session_internal(session_id: str, username: str, worktree: str, branch: str) -> None:
    try:
        diff_stat = git_ops.commit_and_push_worktree(
            worktree, branch, f"session: {username} {datetime.now(timezone.utc).date()}"
        )
        await db.insert_merge_queue(username, branch, session_id, diff_stat)
    except Exception as e:
        log.warning("Failed to commit/push worktree for %s: %s", username, e)
    try:
        git_ops.remove_worktree(worktree)
    except Exception as e:
        log.warning("Failed to remove worktree %s: %s", worktree, e)
    await db.end_session(session_id)


# ── Pydantic models ───────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    username: str
    model: str | None = None
    agent: str | None = None


class SendMessageRequest(BaseModel):
    parts: list[dict[str, Any]]


class AggregateRequest(BaseModel):
    since_date: str
    triggered_by: str = "admin"


class ApproveRequest(BaseModel):
    approved_by: str = "admin"


class ConfigUpdateRequest(BaseModel):
    key: str
    value: str


# ── Session API ───────────────────────────────────────────────────────────────

@app.post("/api/session/start")
async def start_session(req: StartSessionRequest):
    existing = await db.get_session_by_user(req.username)
    if existing:
        await db.touch_session(existing["id"])
        return {"session_id": existing["id"], "branch": existing["branch"], "existing": True}

    worktree, branch = git_ops.setup_worktree(req.username)

    try:
        sess = await oc.create_user_session(title=f"{req.username} — session")
    except Exception as e:
        git_ops.remove_worktree(worktree)
        raise HTTPException(503, f"opencode-user unavailable: {e}")

    session_id = sess.get("id") or sess.get("sessionID")
    if not session_id:
        git_ops.remove_worktree(worktree)
        raise HTTPException(502, "opencode returned no session ID")

    await db.insert_session(
        id=session_id,
        username=req.username,
        worktree=worktree,
        branch=branch,
        model=req.model,
        agent=req.agent,
    )
    log.info("Session started: %s → %s", req.username, session_id)
    return {"session_id": session_id, "branch": branch, "existing": False}


@app.post("/api/session/end")
async def end_session(request: Request):
    body = await request.json()
    username = body.get("username")
    if not username:
        raise HTTPException(400, "username required")

    sess = await db.get_session_by_user(username)
    if not sess:
        raise HTTPException(404, f"No active session for {username}")

    await _end_session_internal(sess["id"], username, sess["worktree"], sess["branch"])
    return {"ok": True}


@app.get("/api/session/me")
async def my_session(username: str):
    sess = await db.get_session_by_user(username)
    if not sess:
        return {"session": None}
    await db.touch_session(sess["id"])
    return {"session": sess}


@app.get("/api/session/list")
async def list_sessions():
    sessions = await db.list_sessions("active")
    return {"sessions": sessions}


@app.post("/api/session/{session_id}/touch")
async def touch_session(session_id: str):
    await db.touch_session(session_id)
    return {"ok": True}


# ── Chat proxy ────────────────────────────────────────────────────────────────

@app.get("/api/chat/sse")
async def chat_sse(request: Request):
    """Fan-out SSE: one opencode connection, N browser subscribers."""
    q: asyncio.Queue = asyncio.Queue(maxsize=256)
    _sse_subscribers.add(q)

    async def event_stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    line = await asyncio.wait_for(q.get(), timeout=15)
                    yield line.encode()
                except asyncio.TimeoutError:
                    yield b": keepalive\n\n"
        finally:
            _sse_subscribers.discard(q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/chat/{session_id}/message")
async def send_message(session_id: str, req: SendMessageRequest):
    sess = await db.get_session(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    await db.touch_session(session_id)
    try:
        result = await oc.send_user_message(session_id, req.parts)
        return result
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, str(e))
    except Exception as e:
        raise HTTPException(502, f"opencode error: {e}")


# ── Agents & providers ────────────────────────────────────────────────────────

@app.get("/api/agents")
async def list_agents():
    try:
        status, content = await oc.get_agents_raw()
        return Response(content=content, media_type="application/json", status_code=status)
    except Exception as e:
        raise HTTPException(502, f"opencode-user unavailable: {e}")


@app.get("/api/providers")
async def list_providers():
    try:
        status, content = await oc.get_providers_raw()
        return Response(content=content, media_type="application/json", status_code=status)
    except Exception as e:
        raise HTTPException(502, f"opencode-user unavailable: {e}")


# ── Skills ────────────────────────────────────────────────────────────────────

def _extract_h1(content: str) -> str | None:
    for line in content.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return None


def _extract_first_para(content: str) -> str:
    in_para = False
    lines = []
    for line in content.splitlines():
        if line.startswith("#"):
            continue
        if line.strip():
            in_para = True
            lines.append(line.strip())
        elif in_para:
            break
    return " ".join(lines)


@app.get("/api/skills")
async def list_skills():
    skills_dir = Path(SKILLS_PATH)
    if not skills_dir.exists():
        return {"skills": []}
    result = []
    for f in sorted(skills_dir.glob("**/*.md")):
        content = f.read_text(encoding="utf-8", errors="ignore")
        result.append({
            "id": f.stem,
            "name": _extract_h1(content) or f.stem,
            "description": _extract_first_para(content),
            "path": str(f.relative_to(skills_dir)),
        })
    return {"skills": result}


@app.get("/api/skills/{skill_id}")
async def get_skill(skill_id: str):
    skills_dir = Path(SKILLS_PATH)
    matches = list(skills_dir.glob(f"**/{skill_id}.md"))
    if not matches:
        raise HTTPException(404, "Skill not found")
    return {"id": skill_id, "content": matches[0].read_text(encoding="utf-8", errors="ignore")}


# ── Admin — session monitor ───────────────────────────────────────────────────

@app.get("/api/admin/sessions")
async def admin_sessions():
    active = await db.list_sessions("active")
    return {"sessions": active}


@app.delete("/api/admin/sessions/{username}")
async def admin_kill_session(username: str):
    sess = await db.get_session_by_user(username)
    if not sess:
        raise HTTPException(404, f"No active session for {username}")
    await _end_session_internal(sess["id"], username, sess["worktree"], sess["branch"])
    return {"ok": True}


# ── Admin — merge queue ───────────────────────────────────────────────────────

@app.get("/api/admin/queue")
async def get_queue(status: str = "pending"):
    items = await db.get_merge_queue(status)
    return {"items": items}


@app.get("/api/admin/queue/{item_id}/diff")
async def get_queue_diff(item_id: int):
    item = await db.get_merge_queue_item(item_id)
    if not item:
        raise HTTPException(404, "Queue item not found")
    diff = git_ops.get_diff(item["branch"])
    return {"diff": diff, "stat": item["diff_stat"], "branch": item["branch"]}


@app.post("/api/admin/queue/{item_id}/approve")
async def approve_queue_item(item_id: int, req: ApproveRequest):
    item = await db.get_merge_queue_item(item_id)
    if not item:
        raise HTTPException(404, "Queue item not found")
    if item["status"] != "pending":
        raise HTTPException(409, f"Item is already {item['status']}")

    if git_ops.has_merge_conflict(item["branch"]):
        raise HTTPException(409, "Merge conflict detected — resolve manually")

    try:
        git_ops.merge_branch(item["branch"], req.approved_by)
        await db.update_merge_queue_status(item_id, "approved")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Merge failed: {e}")


@app.post("/api/admin/queue/{item_id}/reject")
async def reject_queue_item(item_id: int):
    item = await db.get_merge_queue_item(item_id)
    if not item:
        raise HTTPException(404, "Queue item not found")
    git_ops.delete_remote_branch(item["branch"])
    await db.update_merge_queue_status(item_id, "rejected")
    return {"ok": True}


# ── Admin — branch aggregator ─────────────────────────────────────────────────

@app.post("/api/admin/aggregate")
async def trigger_aggregation(req: AggregateRequest):
    branches = git_ops.get_pending_user_branches()
    if not branches:
        return {"status": "skipped", "reason": "no user branches found"}

    try:
        sess = await oc.create_admin_session(f"aggregator-{req.since_date}")
    except Exception as e:
        raise HTTPException(503, f"opencode-admin unavailable: {e}")

    session_id = sess.get("id") or sess.get("sessionID")
    job_id = await db.insert_aggregation(req.triggered_by, req.since_date, branches, session_id)

    asyncio.create_task(_run_aggregation(job_id, session_id, branches, req.since_date))

    return {"job_id": job_id, "session_id": session_id, "branches": branches}


async def _run_aggregation(job_id: int, session_id: str, branches: list[str], since: str) -> None:
    agg_branch = f"aggregated/{since}"
    agg_worktree = f"{git_ops.WORKTREES_PATH}/aggregator-{since}"
    try:
        import subprocess
        subprocess.run(
            ["git", "-C", git_ops.REPO_PATH, "worktree", "add",
             "-b", agg_branch, agg_worktree, "HEAD"],
            check=True, capture_output=True,
        )
        diffs = "\n\n".join(
            f"### Branch: {b}\n{git_ops.get_diff(b)[:3000]}" for b in branches
        )
        prompt = (
            f"You are an aggregator agent. The following git diffs come from {len(branches)} "
            f"user branches since {since}. Synthesize the key changes, decisions, and documentation "
            f"into cohesive wiki entries in the current working directory. "
            f"Focus on completeness and clarity. Avoid duplication.\n\n{diffs}"
        )
        await oc.send_admin_message(session_id, [{"type": "text", "text": prompt}])
        await oc.wait_for_session_idle(session_id, use_admin=True, timeout=600)

        import subprocess as sp
        sp.run(["git", "-C", agg_worktree, "add", "."], capture_output=True)
        sp.run(["git", "-C", agg_worktree, "commit", "-m", f"aggregator: {since}",
                "--allow-empty"], capture_output=True)
        if git_ops.REPO_URL:
            sp.run(["git", "-C", agg_worktree, "push", "-u", "origin", agg_branch],
                   capture_output=True)

        diff_stat = git_ops.get_diff_stat(agg_branch)
        await db.insert_merge_queue(f"aggregator:{since}", agg_branch, session_id, diff_stat)
        await db.update_aggregation(job_id, "done", agg_branch)
        log.info("Aggregation job %d completed", job_id)
    except asyncio.TimeoutError:
        log.error("Aggregation job %d timed out", job_id)
        await db.update_aggregation(job_id, "failed")
        await oc.delete_admin_session(session_id)
    except Exception as e:
        log.error("Aggregation job %d failed: %s", job_id, e)
        await db.update_aggregation(job_id, "failed")


@app.get("/api/admin/aggregate")
async def list_aggregations():
    jobs = await db.list_aggregations()
    return {"jobs": jobs}


@app.get("/api/admin/aggregate/{job_id}/sse")
async def aggregation_sse(job_id: int, request: Request):
    """Stream admin opencode SSE to the UI for live aggregation progress."""
    async def event_stream():
        async for chunk in oc.stream_admin_sse():
            if await request.is_disconnected():
                break
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Admin — repo analysis ─────────────────────────────────────────────────────

@app.get("/api/admin/analysis/activity")
async def analysis_activity(since_days: int = 30):
    activity = git_ops.get_user_activity(since_days)
    return {"activity": activity}


@app.get("/api/admin/analysis/nlp")
async def analysis_nlp():
    try:
        import textstat
        repo = Path(git_ops.REPO_PATH)
        md_files = list(repo.glob("**/*.md"))
        if not md_files:
            return {"files": 0, "word_count": 0, "flesch_kincaid": None, "flesch_reading_ease": None}
        combined = "\n".join(f.read_text(errors="ignore") for f in md_files)
        return {
            "files": len(md_files),
            "word_count": len(combined.split()),
            "flesch_kincaid": round(textstat.flesch_kincaid_grade(combined), 2),
            "flesch_reading_ease": round(textstat.flesch_reading_ease(combined), 2),
            "avg_sentence_length": round(textstat.avg_sentence_length(combined), 2),
        }
    except ImportError:
        raise HTTPException(501, "textstat not installed")


@app.post("/api/admin/analysis/quality-check")
async def quality_check():
    """Trigger an opencode-admin one-shot quality check. Returns job info."""
    try:
        sess = await oc.create_admin_session("quality-check")
    except Exception as e:
        raise HTTPException(503, f"opencode-admin unavailable: {e}")

    session_id = sess.get("id") or sess.get("sessionID")
    prompt = """
Analyze the repository at the current working directory.
For each markdown file in docs/ or wiki/ (or any .md file), evaluate:
- coverage: does it cover its topic fully? (score 0-10)
- clarity: is it clear and unambiguous? (score 0-10)
- freshness: does it appear stale or outdated? (yes/no)
- contradictions: list page names it contradicts (empty list if none)
- orphaned: is it linked from any index.md? (yes/no)

Return ONLY a valid JSON object:
{"files": [{"path": "...", "coverage": 8, "clarity": 7, "freshness": "no", "contradictions": [], "orphaned": false}]}
"""
    asyncio.create_task(_run_quality_check(session_id))
    return {"session_id": session_id, "status": "running"}


async def _run_quality_check(session_id: str) -> None:
    try:
        await oc.send_admin_message(session_id, [{"type": "text", "text": "Analyze markdown files and return quality JSON."}])
        await oc.wait_for_session_idle(session_id, use_admin=True, timeout=300)
    except Exception as e:
        log.error("Quality check failed: %s", e)


# ── Admin — config ────────────────────────────────────────────────────────────

@app.get("/api/admin/config")
async def get_all_config():
    return await db.all_config()


@app.post("/api/admin/config")
async def update_config(req: ConfigUpdateRequest):
    await db.set_config(req.key, req.value)
    return {"ok": True}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "opencode_user": await oc.user_health(),
        "opencode_admin": await oc.admin_health(),
    }


# ── Static files (React SPA) ──────────────────────────────────────────────────

_dist = Path(FRONTEND_DIST)

if _dist.exists():
    app.mount("/assets", StaticFiles(directory=str(_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        file_path = _dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_dist / "index.html"))
else:
    # Dev mode: serve old static/ folder and a placeholder root
    _static = Path("static")
    if _static.exists():
        app.mount("/static", StaticFiles(directory="static"), name="static")

    @app.get("/")
    async def root():
        if (_static / "index.html").exists():
            return FileResponse("static/index.html")
        return Response(
            content="<h1>OpenWiki</h1><p>Run <code>cd frontend && npm run build</code> first.</p>",
            media_type="text/html",
        )

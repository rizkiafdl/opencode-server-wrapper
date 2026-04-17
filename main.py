import asyncio
import logging
import os
import signal
import subprocess
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

_log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, _log_level, logging.INFO), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BASE_REPO = os.environ.get("BASE_REPO_PATH", "/tmp/opencode-repos/base")
REPO_URL = os.environ.get("REPO_URL", "")
IDLE_TIMEOUT_MINUTES = int(os.environ.get("IDLE_TIMEOUT_MINUTES", "15"))
OPENCODE_BASE_PORT = int(os.environ.get("OPENCODE_BASE_PORT", "4100"))

_base_parent = os.path.dirname(BASE_REPO)
# If BASE_REPO_PATH has no parent (e.g. /tmp), put worktrees alongside BASE_REPO instead
WORKTREES_DIR = os.environ.get(
    "WORKTREES_PATH",
    os.path.join(_base_parent if _base_parent != "/" else BASE_REPO, "worktrees"),
)


@dataclass
class Session:
    username: str
    port: int
    pid: int
    pgid: int
    worktree: str
    branch: str
    opencode_proc: subprocess.Popen
    last_active: datetime = field(default_factory=datetime.now)


sessions: dict[str, Session] = {}
port_counter = OPENCODE_BASE_PORT
_port_lock = asyncio.Lock()


def allocate_port() -> int:
    global port_counter
    used = {s.port for s in sessions.values()}
    p = port_counter
    while p in used:
        p += 1
    port_counter = p + 1
    return p


def ensure_base_repo() -> None:
    if REPO_URL and not os.path.exists(BASE_REPO):
        log.info("Cloning base repo %s → %s", REPO_URL, BASE_REPO)
        subprocess.run(["git", "clone", REPO_URL, BASE_REPO], check=True)
    elif not REPO_URL:
        log.warning("REPO_URL not set — skipping base repo clone")
    os.makedirs(WORKTREES_DIR, exist_ok=True)


def branch_exists_on_remote(branch: str) -> bool:
    result = subprocess.run(
        ["git", "-C", BASE_REPO, "ls-remote", "--heads", "origin", branch],
        capture_output=True,
        text=True,
    )
    return bool(result.stdout.strip())


def setup_worktree(username: str) -> tuple[str, str]:
    worktree_path = os.path.join(WORKTREES_DIR, username)
    branch = f"user-{username}"

    if os.path.exists(worktree_path):
        log.info("Worktree already exists at %s", worktree_path)
        return worktree_path, branch

    # Fetch latest remote refs first
    subprocess.run(["git", "-C", BASE_REPO, "fetch", "origin"], check=False)

    if branch_exists_on_remote(branch):
        log.info("Branch %s exists on remote — checking out", branch)
        subprocess.run(
            ["git", "-C", BASE_REPO, "worktree", "add", worktree_path, branch],
            check=True,
        )
        subprocess.run(["git", "-C", worktree_path, "pull"], check=False)
    else:
        log.info("Branch %s does not exist — creating new branch", branch)
        subprocess.run(
            ["git", "-C", BASE_REPO, "worktree", "add", worktree_path, "-b", branch],
            check=True,
        )

    return worktree_path, branch


async def wait_for_opencode(port: int, retries: int = 20, interval: float = 0.5) -> bool:
    url = f"http://localhost:{port}/global/health"
    async with httpx.AsyncClient(timeout=2.0) as client:
        for _ in range(retries):
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("healthy") or data.get("status") == "ok":
                        return True
                    # Accept any 200 as healthy — opencode may vary the payload
                    return True
            except Exception:
                pass
            await asyncio.sleep(interval)
    return False


def teardown_session(username: str) -> None:
    session = sessions.pop(username, None)
    if not session:
        return

    log.info("Tearing down session for %s", username)

    # Push branch to remote (best-effort)
    if REPO_URL:
        subprocess.run(
            ["git", "push", "origin", session.branch],
            cwd=session.worktree,
            check=False,
            capture_output=True,
        )

    # Kill the entire process group
    try:
        os.killpg(session.pgid, signal.SIGTERM)
        log.info("Killed process group %d", session.pgid)
    except ProcessLookupError:
        pass
    except Exception as exc:
        log.warning("Error killing pgid %d: %s", session.pgid, exc)

    # Remove worktree
    subprocess.run(
        ["git", "-C", BASE_REPO, "worktree", "remove", session.worktree, "--force"],
        check=False,
        capture_output=True,
    )

    log.info("Session %s torn down", username)


async def idle_reaper() -> None:
    while True:
        await asyncio.sleep(60)
        cutoff = datetime.now() - timedelta(minutes=IDLE_TIMEOUT_MINUTES)
        idle = [u for u, s in sessions.items() if s.last_active < cutoff]
        for username in idle:
            log.info("Reaping idle session: %s", username)
            teardown_session(username)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_base_repo()
    reaper_task = asyncio.create_task(idle_reaper())
    log.info("OpenCode Manager started — base repo: %s", BASE_REPO)
    yield
    reaper_task.cancel()
    try:
        await reaper_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="OpenCode Session Manager", lifespan=lifespan)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.post("/api/spawn/{username}")
async def spawn(username: str):
    if username in sessions:
        s = sessions[username]
        s.last_active = datetime.now()
        log.info("Session already exists for %s on port %d", username, s.port)
        return {"port": s.port, "username": username, "existing": True}

    async with _port_lock:
        port = allocate_port()

    try:
        worktree_path, branch = setup_worktree(username)
    except subprocess.CalledProcessError as exc:
        raise HTTPException(500, f"Failed to set up worktree: {exc}") from exc

    env = os.environ.copy()
    proc = subprocess.Popen(
        ["opencode", "serve", "--port", str(port)],
        cwd=worktree_path,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        preexec_fn=os.setsid,
        env=env,
    )
    pgid = os.getpgid(proc.pid)
    log.info("Spawned opencode for %s — pid=%d pgid=%d port=%d", username, proc.pid, pgid, port)

    healthy = await wait_for_opencode(port)
    if not healthy:
        try:
            os.killpg(pgid, signal.SIGTERM)
        except Exception:
            pass
        raise HTTPException(503, f"opencode did not become healthy within timeout on port {port}")

    sessions[username] = Session(
        username=username,
        port=port,
        pid=proc.pid,
        pgid=pgid,
        worktree=worktree_path,
        branch=branch,
        opencode_proc=proc,
    )

    return {"port": port, "username": username, "existing": False}


@app.delete("/api/teardown/{username}")
async def teardown(username: str):
    if username not in sessions:
        raise HTTPException(404, f"No active session for {username}")
    teardown_session(username)
    return {"ok": True, "username": username}


@app.get("/api/status")
async def status():
    result = []
    for s in sessions.values():
        result.append(
            {
                "username": s.username,
                "port": s.port,
                "pid": s.pid,
                "worktree": s.worktree,
                "branch": s.branch,
                "last_active": s.last_active.isoformat(),
            }
        )
    return {"sessions": result}


# ---------------------------------------------------------------------------
# SSE proxy (must come BEFORE the catch-all proxy route)
# ---------------------------------------------------------------------------

@app.get("/proxy/{username}/event")
async def proxy_sse(username: str):
    session = sessions.get(username)
    if not session:
        raise HTTPException(404, f"No active session for {username}")
    session.last_active = datetime.now()

    async def stream():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "GET", f"http://localhost:{session.port}/event"
            ) as r:
                async for chunk in r.aiter_bytes():
                    log.debug("SSE chunk [%s]: %s", username, chunk[:200])
                    yield chunk

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Generic proxy catch-all
# ---------------------------------------------------------------------------

@app.api_route(
    "/proxy/{username}/{path:path}",
    methods=["GET", "POST", "DELETE", "PATCH", "PUT"],
)
async def proxy(username: str, path: str, request: Request):
    session = sessions.get(username)
    if not session:
        raise HTTPException(404, f"No active session for {username}")
    session.last_active = datetime.now()

    target = f"http://localhost:{session.port}/{path}"
    body = await request.body()

    # Strip hop-by-hop headers that must not be forwarded
    forward_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length", "transfer-encoding")
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method=request.method,
            url=target,
            headers=forward_headers,
            content=body,
            params=dict(request.query_params),
        )

    # Strip hop-by-hop from response too
    resp_headers = {
        k: v
        for k, v in resp.headers.items()
        if k.lower() not in ("content-encoding", "transfer-encoding", "content-length")
    }

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=resp_headers,
    )


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")
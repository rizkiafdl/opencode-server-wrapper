import base64
import os
from typing import AsyncGenerator

import httpx

OPENCODE_USER_URL = os.environ.get("OPENCODE_USER_URL", "http://localhost:4096")
OPENCODE_ADMIN_URL = os.environ.get("OPENCODE_ADMIN_URL", "http://localhost:4097")
OPENCODE_USER_PASSWORD = os.environ.get("OPENCODE_USER_PASSWORD", "")
OPENCODE_ADMIN_PASSWORD = os.environ.get("OPENCODE_ADMIN_PASSWORD", "")


def _auth_header(password: str) -> dict:
    if not password:
        return {}
    token = base64.b64encode(f":{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _user_client(timeout: float = 30.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=OPENCODE_USER_URL,
        headers=_auth_header(OPENCODE_USER_PASSWORD),
        timeout=timeout,
    )


def _admin_client(timeout: float = 30.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=OPENCODE_ADMIN_URL,
        headers=_auth_header(OPENCODE_ADMIN_PASSWORD),
        timeout=timeout,
    )


# ── User instance ─────────────────────────────────────────────────────────────

async def create_user_session(title: str) -> dict:
    async with _user_client() as c:
        r = await c.post("/session", json={"title": title})
        r.raise_for_status()
        return r.json()


async def delete_user_session(session_id: str) -> None:
    async with _user_client() as c:
        await c.delete(f"/session/{session_id}")


async def send_user_message(session_id: str, parts: list[dict]) -> dict:
    async with _user_client(timeout=60.0) as c:
        r = await c.post(f"/session/{session_id}/message", json={"parts": parts})
        r.raise_for_status()
        return r.json()


async def list_user_sessions() -> list[dict]:
    async with _user_client() as c:
        r = await c.get("/session")
        r.raise_for_status()
        return r.json()


async def get_agents_raw() -> tuple[int, bytes]:
    async with _user_client() as c:
        r = await c.get("/agents")
        return r.status_code, r.content


async def get_providers_raw() -> tuple[int, bytes]:
    async with _user_client() as c:
        r = await c.get("/providers")
        return r.status_code, r.content


async def user_health() -> bool:
    try:
        async with _user_client(timeout=3.0) as c:
            r = await c.get("/global/health")
            return r.status_code == 200
    except Exception:
        return False


async def stream_user_sse() -> AsyncGenerator[bytes, None]:
    async with httpx.AsyncClient(
        base_url=OPENCODE_USER_URL,
        headers=_auth_header(OPENCODE_USER_PASSWORD),
        timeout=None,
    ) as c:
        async with c.stream("GET", "/event") as resp:
            async for chunk in resp.aiter_bytes():
                yield chunk


# ── Admin instance ────────────────────────────────────────────────────────────

async def create_admin_session(title: str) -> dict:
    async with _admin_client() as c:
        r = await c.post("/session", json={"title": title})
        r.raise_for_status()
        return r.json()


async def delete_admin_session(session_id: str) -> None:
    async with _admin_client() as c:
        await c.delete(f"/session/{session_id}")


async def send_admin_message(session_id: str, parts: list[dict]) -> dict:
    async with _admin_client(timeout=60.0) as c:
        r = await c.post(f"/session/{session_id}/message", json={"parts": parts})
        r.raise_for_status()
        return r.json()


async def stream_admin_sse() -> AsyncGenerator[bytes, None]:
    async with httpx.AsyncClient(
        base_url=OPENCODE_ADMIN_URL,
        headers=_auth_header(OPENCODE_ADMIN_PASSWORD),
        timeout=None,
    ) as c:
        async with c.stream("GET", "/sse") as resp:
            async for chunk in resp.aiter_bytes():
                yield chunk


async def admin_health() -> bool:
    try:
        async with _admin_client(timeout=3.0) as c:
            r = await c.get("/global/health")
            return r.status_code == 200
    except Exception:
        return False


async def wait_for_session_idle(
    session_id: str,
    use_admin: bool = False,
    timeout: float = 600,
) -> str:
    """
    Polls session status until idle. Returns final text output.
    Raises asyncio.TimeoutError on timeout.
    """
    import asyncio

    client_fn = _admin_client if use_admin else _user_client
    deadline = asyncio.get_event_loop().time() + timeout
    output = ""

    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            raise asyncio.TimeoutError(f"Session {session_id} did not idle within {timeout}s")

        async with client_fn(timeout=5.0) as c:
            try:
                r = await c.get(f"/session/{session_id}")
                if r.status_code == 200:
                    data = r.json()
                    # collect any output text from messages
                    messages = data.get("messages", [])
                    for msg in messages:
                        if msg.get("role") == "assistant":
                            for part in msg.get("parts", []):
                                if part.get("type") == "text":
                                    output = part.get("text", "")
                    # check if idle
                    if data.get("status", {}).get("type") == "idle":
                        return output
            except Exception:
                pass

        await asyncio.sleep(2)

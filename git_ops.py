import json
import logging
import os
import subprocess
from datetime import date, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

REPO_PATH = os.environ.get("REPO_PATH", "/repos/base")
WORKTREES_PATH = os.environ.get("WORKTREES_PATH", "/worktrees")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO_URL = os.environ.get("REPO_URL", "")


def _git(args: list[str], cwd: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git"] + args,
        cwd=cwd or REPO_PATH,
        capture_output=True,
        text=True,
        check=check,
    )


def _authed_url(url: str) -> str:
    if GITHUB_TOKEN and url.startswith("https://"):
        return url.replace("https://", f"https://{GITHUB_TOKEN}@", 1)
    return url


# ── Repo setup ────────────────────────────────────────────────────────────────

def ensure_base_repo() -> None:
    os.makedirs(WORKTREES_PATH, exist_ok=True)
    if os.path.exists(os.path.join(REPO_PATH, ".git")):
        log.info("Base repo already exists at %s", REPO_PATH)
        _git(["fetch", "--all"], check=False)
        return
    if not REPO_URL:
        log.warning("REPO_URL not set — initialising empty repo at %s", REPO_PATH)
        os.makedirs(REPO_PATH, exist_ok=True)
        _git(["init"], cwd=REPO_PATH)
        _git(["commit", "--allow-empty", "-m", "init"], cwd=REPO_PATH)
        return
    os.makedirs(os.path.dirname(REPO_PATH), exist_ok=True)
    log.info("Cloning %s → %s", REPO_URL, REPO_PATH)
    subprocess.run(
        ["git", "clone", _authed_url(REPO_URL), REPO_PATH],
        check=True,
    )


def _branch_exists_remote(branch: str) -> bool:
    r = _git(["ls-remote", "--heads", "origin", branch], check=False)
    return bool(r.stdout.strip())


# ── Worktree management ───────────────────────────────────────────────────────

def setup_worktree(username: str) -> tuple[str, str]:
    worktree_path = os.path.join(WORKTREES_PATH, username)
    branch = f"user/{username}"

    if os.path.exists(worktree_path):
        log.info("Worktree already exists: %s", worktree_path)
        return worktree_path, branch

    _git(["fetch", "origin"], check=False)

    if _branch_exists_remote(branch):
        log.info("Checking out existing remote branch %s", branch)
        _git(["worktree", "add", worktree_path, branch])
        _git(["pull"], cwd=worktree_path)
    else:
        log.info("Creating new branch %s", branch)
        _git(["worktree", "add", "-b", branch, worktree_path, "HEAD"])

    _write_opencode_config(worktree_path)
    return worktree_path, branch


def _write_opencode_config(worktree_path: str) -> None:
    config = {
        "$schema": "https://opencode.ai/config.json",
        "permission": {
            "bash": {
                "git add *": "allow",
                "git commit *": "allow",
                "git status": "allow",
                "git diff *": "allow",
                "git log *": "allow",
                "rm -rf *": "deny",
            }
        },
    }
    config_path = os.path.join(worktree_path, ".opencode", "config.json")
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    Path(config_path).write_text(json.dumps(config, indent=2))


def remove_worktree(worktree_path: str) -> None:
    _git(["worktree", "remove", worktree_path, "--force"], check=False)


# ── Push / commit ─────────────────────────────────────────────────────────────

def commit_and_push_worktree(worktree_path: str, branch: str, message: str) -> str:
    """Commits all changes in worktree and pushes. Returns diff --stat."""
    _git(["add", "."], cwd=worktree_path)

    status = _git(["status", "--porcelain"], cwd=worktree_path)
    if status.stdout.strip():
        _git(["commit", "-m", message, "--allow-empty"], cwd=worktree_path)

    if REPO_URL:
        _git(["push", "-u", "origin", branch], cwd=worktree_path, check=False)

    diff = _git(["diff", "--stat", "HEAD~1..HEAD"], cwd=worktree_path, check=False)
    return diff.stdout or "(no changes)"


def get_diff(branch: str) -> str:
    result = _git(["diff", f"HEAD...{branch}"], check=False)
    return result.stdout


def get_diff_stat(branch: str) -> str:
    result = _git(["diff", "--stat", f"HEAD...{branch}"], check=False)
    return result.stdout


# ── Merge operations ──────────────────────────────────────────────────────────

def merge_branch(branch: str, approved_by: str) -> None:
    _git(["fetch", "origin"], check=False)
    _git([
        "merge", branch, "--no-ff",
        "-m", f"merge: {branch} approved by {approved_by}"
    ])
    if REPO_URL:
        _git(["push", "origin", "HEAD"], check=False)


def delete_remote_branch(branch: str) -> None:
    if REPO_URL:
        _git(["push", "origin", "--delete", branch], check=False)


def has_merge_conflict(branch: str) -> bool:
    result = _git(["merge", "--no-commit", "--no-ff", branch], check=False)
    _git(["merge", "--abort"], check=False)
    return result.returncode != 0


# ── Activity metrics ──────────────────────────────────────────────────────────

def get_user_activity(since_days: int = 30) -> list[dict]:
    since = (date.today() - timedelta(days=since_days)).isoformat()
    result = _git([
        "log", f"--since={since}",
        "--format=%ae\t%ad\t%H",
        "--date=short", "--all",
    ], check=False)

    user_data: dict[str, dict] = {}
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        email, day = parts[0], parts[1]
        if email not in user_data:
            user_data[email] = {"email": email, "commits": 0, "days": set(), "last_commit": day}
        user_data[email]["commits"] += 1
        user_data[email]["days"].add(day)
        if day > user_data[email]["last_commit"]:
            user_data[email]["last_commit"] = day

    return [
        {
            "email": v["email"],
            "commits": v["commits"],
            "active_days": len(v["days"]),
            "last_commit": v["last_commit"],
        }
        for v in user_data.values()
    ]


def get_pending_user_branches() -> list[str]:
    result = _git([
        "for-each-ref",
        "--sort=-committerdate",
        "--format=%(refname:short)",
        "refs/remotes/origin/user/",
    ], check=False)
    return [
        line.replace("origin/", "")
        for line in result.stdout.strip().split("\n")
        if line
    ]
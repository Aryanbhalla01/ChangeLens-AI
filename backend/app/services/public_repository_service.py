"""Safely clone and register public GitHub repositories in managed storage."""

import hashlib
import http.client
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

from flask import current_app
from git import BadName, BadObject, GitCommandError, Repo

from ..models import RepositoryRegistration, db
from ..utils.errors import ApiError
from ..utils.validators import validate_repository_path
from .repository_service import _open_registered, _repository_summary

_GITHUB_REPOSITORY_URL = re.compile(
    r"^https://github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)/"
    r"([A-Za-z0-9][A-Za-z0-9._-]{0,99})$"
)
_MAX_GITHUB_API_RESPONSE_BYTES = 64 * 1024
_MAX_REPOSITORY_TREE_ENTRIES = 100_000


def validate_public_repository_url(url: str) -> tuple[str, str]:
    """Accept only a canonical HTTPS GitHub owner/repository URL."""
    if not isinstance(url, str) or len(url) > 200:
        raise ApiError(
            "INVALID_GITHUB_REPOSITORY_URL",
            "Provide a canonical https://github.com/{owner}/{repo} URL without a trailing slash or .git suffix.",
            400,
        )
    match = _GITHUB_REPOSITORY_URL.fullmatch(url)
    if match is None or match.group(2).lower().endswith(".git"):
        raise ApiError(
            "INVALID_GITHUB_REPOSITORY_URL",
            "Provide a canonical https://github.com/{owner}/{repo} URL without credentials, query strings, extra paths, or a .git suffix.",
            400,
        )
    return match.group(1), match.group(2)


def connect_public_repository(url: str) -> dict:
    """Clone a size-bounded public repository and register its managed working tree."""
    owner, repository_name = validate_public_repository_url(url)
    managed_root = _managed_repository_root()
    target = managed_root / hashlib.sha256(url.encode("ascii")).hexdigest()
    allowed_roots = _repository_roots(managed_root)

    existing = RepositoryRegistration.query.filter_by(path=str(target)).one_or_none()
    if existing is not None:
        _, repository = _open_registered(existing)
        return _repository_summary(existing, repository)
    if target.exists() or target.is_symlink():
        raise ApiError(
            "MANAGED_REPOSITORY_UNAVAILABLE",
            "A managed repository directory already exists and is not registered.",
            409,
        )

    size_provider = current_app.config.get("PUBLIC_REPOSITORY_SIZE_PROVIDER")
    estimated_size = (
        size_provider(owner, repository_name)
        if size_provider
        else _github_repository_size(owner, repository_name)
    )
    if (
        isinstance(estimated_size, bool)
        or not isinstance(estimated_size, int)
        or estimated_size < 0
    ):
        raise ApiError(
            "GITHUB_METADATA_UNAVAILABLE",
            "GitHub returned invalid repository size metadata.",
            502,
        )
    if estimated_size > current_app.config["MAX_PUBLIC_REPOSITORY_SIZE_BYTES"]:
        raise ApiError(
            "PUBLIC_REPOSITORY_TOO_LARGE",
            "The public repository exceeds the configured size limit.",
            413,
        )

    try:
        target.mkdir()
    except FileExistsError as error:
        raise ApiError(
            "MANAGED_REPOSITORY_UNAVAILABLE",
            "A managed repository directory already exists and is not registered.",
            409,
        ) from error
    try:
        cloner = current_app.config.get("PUBLIC_REPOSITORY_CLONER")
        if cloner:
            cloner(url, target)
        else:
            _clone_public_repository(url, target, managed_root)

        canonical_path, repository = validate_repository_path(
            str(target), allowed_roots
        )
        if canonical_path != target.resolve(strict=True):
            raise ApiError(
                "MANAGED_REPOSITORY_UNAVAILABLE",
                "The managed repository path changed during cloning.",
                409,
            )
        if (
            _repository_tree_size(canonical_path)
            > current_app.config["MAX_PUBLIC_REPOSITORY_CHECKOUT_BYTES"]
        ):
            raise ApiError(
                "PUBLIC_REPOSITORY_TOO_LARGE",
                "The cloned repository exceeds the configured storage limit.",
                413,
            )
        _materialize_remote_branches(repository)

        registration = RepositoryRegistration(
            id=str(uuid4()),
            path=str(canonical_path),
            name=f"{owner}/{repository_name}",
        )
        db.session.add(registration)
        db.session.commit()
        return _repository_summary(registration, repository)
    except Exception:
        db.session.rollback()
        _remove_managed_clone(target, managed_root)
        raise


def _managed_repository_root() -> Path:
    configured_root = Path(current_app.config["MANAGED_REPOSITORY_ROOT"]).expanduser()
    try:
        configured_root.mkdir(parents=True, exist_ok=True)
        if configured_root.is_symlink() or not configured_root.is_dir():
            raise OSError("Managed repository root must be a real directory")
        return configured_root.resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as error:
        raise ApiError(
            "MANAGED_STORAGE_UNAVAILABLE",
            "Managed repository storage is unavailable.",
            500,
        ) from error


def _repository_roots(managed_root: Path) -> list[str]:
    return [*current_app.config["ALLOWED_REPOSITORY_ROOTS"], str(managed_root)]


def _github_repository_size(owner: str, repository_name: str) -> int:
    connection = http.client.HTTPSConnection("api.github.com", timeout=5)
    try:
        connection.request(
            "GET",
            f"/repos/{owner}/{repository_name}",
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "ChangeLens-AI",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        response = connection.getresponse()
        body = response.read(_MAX_GITHUB_API_RESPONSE_BYTES + 1)
        if response.status == 404:
            raise ApiError(
                "PUBLIC_REPOSITORY_NOT_FOUND",
                "The public GitHub repository was not found or is unavailable.",
                404,
            )
        if response.status != 200 or len(body) > _MAX_GITHUB_API_RESPONSE_BYTES:
            raise ApiError(
                "GITHUB_METADATA_UNAVAILABLE",
                "GitHub repository size metadata could not be retrieved.",
                502,
            )
        try:
            payload = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ApiError(
                "GITHUB_METADATA_UNAVAILABLE",
                "GitHub returned invalid repository metadata.",
                502,
            ) from error
        size_kib = payload.get("size") if isinstance(payload, dict) else None
        if isinstance(size_kib, bool) or not isinstance(size_kib, int) or size_kib < 0:
            raise ApiError(
                "GITHUB_METADATA_UNAVAILABLE",
                "GitHub returned invalid repository size metadata.",
                502,
            )
        return size_kib * 1024
    except ApiError:
        raise
    except (OSError, http.client.HTTPException, TimeoutError) as error:
        raise ApiError(
            "GITHUB_METADATA_UNAVAILABLE",
            "GitHub repository size metadata could not be retrieved.",
            502,
        ) from error
    finally:
        connection.close()


def _clone_public_repository(url: str, destination: Path, managed_root: Path) -> None:
    git_executable = shutil.which("git")
    if git_executable is None:
        raise ApiError("GIT_UNAVAILABLE", "Git is not available on the server.", 503)

    template = managed_root / ".empty-git-template"
    hooks = managed_root / ".disabled-git-hooks"
    home = managed_root / ".git-home"
    template.mkdir(exist_ok=True)
    hooks.mkdir(exist_ok=True)
    home.mkdir(exist_ok=True)

    command = [
        git_executable,
        "-c",
        "protocol.allow=never",
        "-c",
        "protocol.https.allow=always",
        "-c",
        "credential.helper=",
        "-c",
        "http.followRedirects=false",
        "clone",
        "--no-tags",
        "--no-recurse-submodules",
        "--config",
        "core.fsmonitor=false",
        "--config",
        f"core.hooksPath={hooks}",
        "--template",
        str(template),
        url,
        str(destination),
    ]
    environment = {
        key: value
        for key, value in os.environ.items()
        if not key.upper().startswith("GIT_")
    }
    environment.update(
        {
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_ASKPASS": "",
            "SSH_ASKPASS": "",
            "HOME": str(home),
            "USERPROFILE": str(home),
            "APPDATA": str(home / "AppData" / "Roaming"),
            "XDG_CONFIG_HOME": str(home / ".config"),
        }
    )
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=current_app.config["PUBLIC_REPOSITORY_CLONE_TIMEOUT_SECONDS"],
            env=environment,
            shell=False,
        )
    except subprocess.TimeoutExpired as error:
        raise ApiError(
            "PUBLIC_REPOSITORY_CLONE_TIMEOUT",
            "Cloning the public repository exceeded the configured time limit.",
            504,
        ) from error
    except OSError as error:
        raise ApiError(
            "PUBLIC_REPOSITORY_CLONE_FAILED",
            "The public GitHub repository could not be cloned.",
            502,
        ) from error
    if result.returncode != 0:
        raise ApiError(
            "PUBLIC_REPOSITORY_CLONE_FAILED",
            "The public GitHub repository could not be cloned.",
            502,
        )


def _repository_tree_size(root: Path) -> int:
    total = 0
    entries_seen = 0
    pending = [root]
    while pending:
        directory = pending.pop()
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    entries_seen += 1
                    if entries_seen > _MAX_REPOSITORY_TREE_ENTRIES:
                        return current_app.config["MAX_PUBLIC_REPOSITORY_CHECKOUT_BYTES"] + 1
                    try:
                        metadata = entry.stat(follow_symlinks=False)
                    except OSError as error:
                        raise ApiError(
                            "MANAGED_REPOSITORY_UNAVAILABLE",
                            "The cloned repository could not be inspected safely.",
                            422,
                        ) from error
                    total += metadata.st_size
                    if entry.is_dir(follow_symlinks=False):
                        pending.append(Path(entry.path))
                    if total > current_app.config["MAX_PUBLIC_REPOSITORY_CHECKOUT_BYTES"]:
                        return total
        except OSError as error:
            raise ApiError(
                "MANAGED_REPOSITORY_UNAVAILABLE",
                "The cloned repository could not be inspected safely.",
                422,
            ) from error
    return total


def _materialize_remote_branches(repository: Repo) -> None:
    """Expose fetched GitHub branches through the API's existing local-branch filter."""
    local_branches = {branch.name for branch in repository.branches}
    try:
        for remote in repository.remotes:
            if remote.name != "origin":
                continue
            for remote_ref in remote.refs:
                branch_name = remote_ref.remote_head
                if branch_name == "HEAD" or branch_name in local_branches:
                    continue
                repository.create_head(branch_name, remote_ref)
                local_branches.add(branch_name)
    except (BadName, BadObject, GitCommandError, ValueError) as error:
        raise ApiError(
            "PUBLIC_REPOSITORY_CLONE_FAILED",
            "The public GitHub repository branches could not be prepared.",
            502,
        ) from error


def _remove_managed_clone(target: Path, managed_root: Path) -> None:
    try:
        if target.is_symlink() or not target.exists():
            return
        canonical_target = target.resolve(strict=True)
        canonical_target.relative_to(managed_root)
        shutil.rmtree(canonical_target)
    except (OSError, RuntimeError, ValueError):
        current_app.logger.exception("Could not clean up a failed managed repository clone")

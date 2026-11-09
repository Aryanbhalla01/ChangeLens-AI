"""Persistence and validation for connected local repositories."""

from datetime import timezone
from itertools import islice
from pathlib import Path
from uuid import uuid4

from flask import current_app
from git import BadName, BadObject, GitCommandError, Repo
from sqlalchemy.exc import IntegrityError

from ..models import RepositoryRegistration, db
from ..utils.errors import ApiError
from ..utils.validators import validate_repository_path


def connect_repository(path: str) -> dict:
    allowed_path, repository = validate_repository_path(
        path, current_app.config["ALLOWED_REPOSITORY_ROOTS"]
    )
    existing = RepositoryRegistration.query.filter_by(path=str(allowed_path)).one_or_none()
    if existing is None:
        existing = RepositoryRegistration(
            id=str(uuid4()), path=str(allowed_path), name=allowed_path.name
        )
        db.session.add(existing)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            existing = RepositoryRegistration.query.filter_by(path=str(allowed_path)).one()
    return _repository_summary(existing, repository)


def list_repositories() -> list[dict]:
    result = []
    for registration in RepositoryRegistration.query.order_by(
        RepositoryRegistration.created_at.desc()
    ).all():
        try:
            _, repository = _open_registered(registration)
        except ApiError:
            continue
        result.append(_repository_summary(registration, repository))
    return result


def get_repository_detail(repository_id: str) -> dict:
    registration, repository = get_registered_repository(repository_id)
    return _repository_summary(registration, repository)


def get_repository_status(repository_id: str) -> dict:
    registration, repository = get_registered_repository(repository_id)
    try:
        branch = repository.active_branch.name
    except (TypeError, AttributeError, BadName, ValueError):
        branch = None

    staged = len(repository.index.diff("HEAD")) if _has_head(repository) else 0
    modified = len(repository.index.diff(None))
    untracked = list(islice(repository.untracked_files, 1001))
    commit_count, count_truncated = _commit_count(repository)
    return {
        "id": registration.id,
        "branch": branch,
        "isDirty": repository.is_dirty(untracked_files=False) or modified > 0 or bool(untracked),
        "stagedFileCount": staged,
        "modifiedFileCount": modified,
        "untrackedFileCount": min(len(untracked), 1000),
        "untrackedFileCountTruncated": len(untracked) > 1000,
        "commitCount": commit_count,
        "commitCountTruncated": count_truncated,
    }


def get_registered_repository(repository_id: str) -> tuple[RepositoryRegistration, Repo]:
    registration = db.session.get(RepositoryRegistration, repository_id)
    if registration is None:
        raise ApiError("REPOSITORY_NOT_FOUND", "The repository is not registered.", 404)
    repository = _open_registered(registration)[1]
    return registration, repository


def _open_registered(registration: RepositoryRegistration) -> tuple[Path, Repo]:
    path, repository = validate_repository_path(
        registration.path,
        [
            *current_app.config["ALLOWED_REPOSITORY_ROOTS"],
            str(current_app.config["MANAGED_REPOSITORY_ROOT"]),
        ],
    )
    if str(path) != registration.path:
        raise ApiError(
            "REPOSITORY_UNAVAILABLE",
            "The registered repository path has changed and must be connected again.",
            409,
        )
    return path, repository


def _repository_summary(registration: RepositoryRegistration, repository: Repo) -> dict:
    try:
        branch = repository.active_branch.name
    except (TypeError, AttributeError, BadName, ValueError):
        branch = None
    latest_commit = None
    try:
        commit = repository.head.commit
        latest_commit = {
            "hash": commit.hexsha,
            "shortHash": commit.hexsha[:7],
            "author": commit.author.name or "",
            "date": commit.committed_datetime.astimezone(timezone.utc).isoformat(),
            "message": commit.message.strip(),
        }
    except (BadName, BadObject, ValueError):
        pass
    commit_count, count_truncated = _commit_count(repository)
    return {
        "id": registration.id,
        "name": registration.name,
        "path": registration.path,
        "branch": branch,
        "latestCommit": latest_commit,
        "commitCount": commit_count,
        "commitCountTruncated": count_truncated,
        "createdAt": registration.created_at.isoformat(),
    }


def _has_head(repository: Repo) -> bool:
    try:
        repository.head.commit
        return True
    except (BadName, BadObject, ValueError):
        return False


def _commit_count(repository: Repo) -> tuple[int, bool]:
    if not _has_head(repository):
        return 0, False
    try:
        count = sum(
            1
            for _ in repository.iter_commits(max_count=current_app.config["MAX_HISTORY_SCAN"] + 1)
        )
    except (BadName, BadObject, GitCommandError, ValueError) as error:
        raise ApiError(
            "GIT_HISTORY_UNAVAILABLE",
            "The repository commit history could not be read.",
            422,
        ) from error
    limit = current_app.config["MAX_HISTORY_SCAN"]
    return min(count, limit), count > limit

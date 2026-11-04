"""Read-only commit history and details using GitPython."""

from datetime import timezone
from itertools import islice

from flask import current_app
from git import BadName, BadObject, GitCommandError, NULL_TREE, Repo

from ..utils.errors import ApiError
from ..utils.validators import validate_commit_hash
from .repository_service import get_registered_repository


def get_commit_history(
    repository_id: str, *, page: int, per_page: int, search: str, branch: str | None
) -> dict:
    _, repository = get_registered_repository(repository_id)
    revision = "HEAD"
    if branch:
        branch_ref = next((item for item in repository.branches if item.name == branch), None)
        if branch_ref is None:
            raise ApiError("INVALID_BRANCH", "The requested branch does not exist.", 400)
        revision = branch_ref.commit.hexsha

    max_scan = current_app.config["MAX_HISTORY_SCAN"]
    try:
        commits = list(
            islice(
                repository.iter_commits(rev=revision, max_count=max_scan + 1),
                max_scan + 1,
            )
        )
    except (BadName, ValueError, GitCommandError) as error:
        raise ApiError("EMPTY_REPOSITORY", "The repository has no commits to list.", 404) from error

    scan_truncated = len(commits) > max_scan
    commits = commits[:max_scan]
    query = search.casefold()
    matching = [commit for commit in commits if query in commit.message.casefold()]
    start = (page - 1) * per_page
    selected = matching[start : start + per_page]
    return {
        "items": [_commit_summary(repository, commit) for commit in selected],
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": None if scan_truncated else len(matching),
            "hasMore": start + per_page < len(matching) or scan_truncated,
            "truncated": scan_truncated,
        },
    }


def get_commit_details(repository_id: str, commit_hash: str) -> dict:
    _, repository = get_registered_repository(repository_id)
    commit = _resolve_commit(repository, commit_hash)
    try:
        if commit.parents:
            diffs = commit.parents[0].diff(
                commit, create_patch=False, find_renames=True
            )
        else:
            diffs = commit.diff(NULL_TREE, create_patch=False, find_renames=True)
    except (BadObject, BadName, GitCommandError, ValueError) as error:
        raise ApiError("COMMIT_DIFF_UNAVAILABLE", "The commit changes could not be read.", 422) from error

    limit = current_app.config["MAX_COMMIT_FILES"]
    file_items = [_diff_file_metadata(diff) for diff in islice(diffs, limit + 1)]
    truncated = len(file_items) > limit
    file_items = file_items[:limit]
    summary = _commit_summary(repository, commit)
    return {
        **summary,
        "parents": [
            {"hash": item.hexsha, "shortHash": item.hexsha[:7], "message": item.message.strip()}
            for item in commit.parents
        ],
        "files": file_items,
        "addedFiles": [item for item in file_items if item["changeType"] == "added"],
        "modifiedFiles": [item for item in file_items if item["changeType"] == "modified"],
        "deletedFiles": [item for item in file_items if item["changeType"] == "deleted"],
        "renamedFiles": [item for item in file_items if item["changeType"] == "renamed"],
        "filesTruncated": truncated,
    }


def resolve_commit(repository: Repo, commit_hash: str):
    return _resolve_commit(repository, commit_hash)


def _resolve_commit(repository: Repo, commit_hash: str):
    commit_hash = validate_commit_hash(commit_hash)
    try:
        return repository.commit(commit_hash)
    except (BadName, BadObject, ValueError, GitCommandError) as error:
        raise ApiError("INVALID_COMMIT_HASH", "The commit hash was not found.", 404) from error


def _commit_summary(repository: Repo, commit) -> dict:
    stats = _commit_stats(commit)
    try:
        branches = [
            branch.name
            for branch in repository.branches
            if branch.commit.hexsha == commit.hexsha
        ]
    except (BadName, ValueError, GitCommandError):
        branches = []
    return {
        "hash": commit.hexsha,
        "shortHash": commit.hexsha[:7],
        "author": commit.author.name or "",
        "date": commit.committed_datetime.astimezone(timezone.utc).isoformat(),
        "message": commit.message.strip(),
        "branch": branches[0] if branches else None,
        "changedFileCount": stats["changedFileCount"],
        "insertions": stats["insertions"],
        "deletions": stats["deletions"],
        "statsAvailable": stats["available"],
    }


def _commit_stats(commit) -> dict:
    try:
        stats = commit.stats.total
        return {
            "changedFileCount": stats.get("files", 0),
            "insertions": stats.get("insertions", 0),
            "deletions": stats.get("deletions", 0),
            "available": True,
        }
    except (BadName, BadObject, GitCommandError, ValueError):
        return {
            "changedFileCount": None,
            "insertions": None,
            "deletions": None,
            "available": False,
        }


def _diff_file_metadata(diff) -> dict:
    if diff.renamed_file:
        change_type = "renamed"
    elif diff.new_file:
        change_type = "added"
    elif diff.deleted_file:
        change_type = "deleted"
    else:
        change_type = "modified"
    return {
        "path": diff.b_path or diff.a_path or "",
        "previousPath": diff.a_path if diff.renamed_file else None,
        "changeType": change_type,
    }

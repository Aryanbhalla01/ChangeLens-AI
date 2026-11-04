"""Bounded text diff generation for commit comparisons."""

import difflib
from itertools import islice

from flask import current_app
from git import BadObject, GitCommandError, NULL_TREE

from ..utils.errors import ApiError
from .git_service import _commit_summary, resolve_commit
from .repository_service import get_registered_repository


def compare_commits(repository_id: str, *, base: str, target: str) -> dict:
    _, repository = get_registered_repository(repository_id)
    base_commit = resolve_commit(repository, base)
    target_commit = resolve_commit(repository, target)
    try:
        diffs = base_commit.diff(target_commit, create_patch=False, find_renames=True)
        limit = current_app.config["MAX_COMPARE_FILES"]
        selected = list(islice(diffs, limit + 1))
    except (BadObject, GitCommandError, ValueError) as error:
        raise ApiError("COMPARE_UNAVAILABLE", "The requested commits could not be compared.", 422) from error
    return _format_diff_response(
        repository, base_commit, target_commit, selected, limit=limit
    )


def get_commit_diff(repository_id: str, commit_hash: str, *, python_only: bool = False) -> dict:
    """Return bounded first-parent (or root) diff data for one registered commit."""
    _, repository = get_registered_repository(repository_id)
    commit = resolve_commit(repository, commit_hash)
    base_commit = commit.parents[0] if commit.parents else None
    try:
        diffs = (
            base_commit.diff(commit, create_patch=False, find_renames=True)
            if base_commit is not None
            else commit.diff(NULL_TREE, create_patch=False, find_renames=True)
        )
        limit = current_app.config["MAX_COMPARE_FILES"]
        selected = list(islice(diffs, limit + 1))
    except (BadObject, GitCommandError, ValueError) as error:
        raise ApiError(
            "COMMIT_DIFF_UNAVAILABLE", "The commit changes could not be read.", 422
        ) from error
    return _format_diff_response(
        repository,
        base_commit,
        commit,
        selected,
        limit=limit,
        python_only=python_only,
    )


def _format_diff_response(
    repository,
    base_commit,
    target_commit,
    selected,
    *,
    limit: int,
    python_only: bool = False,
) -> dict:
    files_truncated = len(selected) > limit
    selected = selected[:limit]
    if python_only:
        selected = [
            item
            for item in selected
            if _is_python_path(item.a_path) or _is_python_path(item.b_path)
        ]
    remaining = current_app.config["MAX_DIFF_RESPONSE_BYTES"]
    files = []
    for diff in selected:
        item = _compare_file(diff, remaining)
        encoded_size = len(item["diff"].encode("utf-8"))
        remaining = max(0, remaining - encoded_size)
        files.append(item)
    return {
        "baseCommit": _commit_summary(repository, base_commit) if base_commit else None,
        "targetCommit": _commit_summary(repository, target_commit),
        "files": files,
        "filesTruncated": files_truncated,
        "diffTruncated": files_truncated or any(item["truncated"] for item in files),
        "limits": {
            "maxFiles": limit,
            "maxDiffResponseBytes": current_app.config["MAX_DIFF_RESPONSE_BYTES"],
        },
    }


def _is_python_path(path: str | None) -> bool:
    return bool(path and path.casefold().endswith(".py"))


def _compare_file(diff, response_bytes_remaining: int) -> dict:
    change_type = _change_type(diff)
    path = diff.b_path or diff.a_path or ""
    result = {
        "path": path,
        "previousPath": diff.a_path if diff.renamed_file else None,
        "changeType": change_type,
        "additions": None,
        "deletions": None,
        "binary": False,
        "truncated": False,
        "diff": "",
    }
    old_blob = diff.a_blob
    new_blob = diff.b_blob
    if old_blob is None and new_blob is None:
        result["truncated"] = True
        return result
    if any(
        blob is not None and blob.size > current_app.config["MAX_BLOB_READ_BYTES"]
        for blob in (old_blob, new_blob)
    ):
        result["truncated"] = True
        return result

    old_bytes = old_blob.data_stream.read(current_app.config["MAX_BLOB_READ_BYTES"] + 1) if old_blob else b""
    new_bytes = new_blob.data_stream.read(current_app.config["MAX_BLOB_READ_BYTES"] + 1) if new_blob else b""
    if b"\x00" in old_bytes or b"\x00" in new_bytes:
        result["binary"] = True
        return result

    old_lines = old_bytes.decode("utf-8", errors="replace").splitlines(keepends=True)
    new_lines = new_bytes.decode("utf-8", errors="replace").splitlines(keepends=True)
    if len(old_lines) + len(new_lines) > current_app.config["MAX_DIFF_LINES"]:
        result["truncated"] = True
        return result

    patch_lines = list(
        difflib.unified_diff(
            old_lines,
            new_lines,
            fromfile=f"a/{diff.a_path or path}",
            tofile=f"b/{diff.b_path or path}",
            lineterm="\n",
        )
    )
    result["additions"] = sum(
        1 for line in patch_lines if line.startswith("+") and not line.startswith("+++")
    )
    result["deletions"] = sum(
        1 for line in patch_lines if line.startswith("-") and not line.startswith("---")
    )
    patch = "".join(patch_lines)
    file_limit = current_app.config["MAX_FILE_DIFF_BYTES"]
    output_limit = min(file_limit, response_bytes_remaining)
    encoded = patch.encode("utf-8")
    if len(encoded) > output_limit:
        encoded = encoded[:output_limit]
        patch = encoded.decode("utf-8", errors="ignore")
        result["truncated"] = True
    result["diff"] = patch
    return result


def _change_type(diff) -> str:
    if diff.renamed_file:
        return "renamed"
    if diff.new_file:
        return "added"
    if diff.deleted_file:
        return "deleted"
    return "modified"

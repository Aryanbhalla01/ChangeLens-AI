"""Optional, provider-neutral AI summaries for bounded commit diffs."""

import json
import ipaddress
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from flask import current_app

from .diff_service import get_commit_diff
from .git_service import get_commit_details

_SUMMARY_FIELDS = (
    "what_changed",
    "why_it_matters",
    "important_files",
    "suggested_review_checks",
)
_MAX_COMMIT_MESSAGE_CHARS = 2_000
_MAX_AUTHOR_CHARS = 200
_MAX_PATH_CHARS = 500
_MAX_SECTION_CHARS = 1_000
_MAX_LIST_ITEMS = 5
_MAX_LIST_ITEM_CHARS = 300


def summarize_commit(repository_id: str, commit_hash: str) -> dict:
    """Summarize one commit, or return an explicit unavailable result."""
    endpoint = current_app.config.get("AI_SUMMARY_API_URL")
    api_key = current_app.config.get("AI_SUMMARY_API_KEY")
    if not endpoint or not api_key:
        return _unavailable("provider is not configured")
    if not _is_http_endpoint(endpoint):
        return _unavailable("provider configuration is invalid")

    commit = get_commit_details(repository_id, commit_hash)
    diff = get_commit_diff(repository_id, commit_hash)
    payload = _build_provider_payload(commit, diff)
    try:
        response = _request_provider(
            endpoint,
            api_key,
            payload,
            current_app.config["AI_SUMMARY_TIMEOUT_SECONDS"],
            current_app.config["AI_SUMMARY_MAX_RESPONSE_BYTES"],
        )
        summary = _validate_summary(response, {item["path"] for item in payload["files"]})
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        current_app.logger.warning("AI summary provider request failed: %s", type(error).__name__)
        return _unavailable("provider request failed")
    except Exception:
        current_app.logger.exception("AI summary provider failed unexpectedly")
        return _unavailable("provider request failed")

    return {
        "available": True,
        "summary": _format_summary(summary),
        "whatChanged": summary["what_changed"],
        "whyItMatters": summary["why_it_matters"],
        "importantFiles": summary["important_files"],
        "suggestedReviewChecks": summary["suggested_review_checks"],
    }


def _build_provider_payload(commit: dict, diff: dict) -> dict:
    """Keep metadata small and consume only the existing bounded diff response."""
    metadata = {
        key: commit.get(key)
        for key in ("hash", "shortHash", "date", "changedFileCount", "insertions", "deletions")
    }
    metadata["message"] = str(commit.get("message") or "")[:_MAX_COMMIT_MESSAGE_CHARS]
    metadata["author"] = str(commit.get("author") or "")[:_MAX_AUTHOR_CHARS]
    metadata["branch"] = (
        str(commit["branch"])[:_MAX_AUTHOR_CHARS] if commit.get("branch") else None
    )
    files = []
    for item in diff.get("files", []):
        files.append(
            {
                "path": str(item.get("path") or "")[:_MAX_PATH_CHARS],
                "previousPath": (
                    str(item["previousPath"])[:_MAX_PATH_CHARS]
                    if item.get("previousPath")
                    else None
                ),
                "changeType": item.get("changeType"),
                "additions": item.get("additions"),
                "deletions": item.get("deletions"),
                "diff": item.get("diff", ""),
                "binary": bool(item.get("binary")),
                "truncated": bool(item.get("truncated")),
            }
        )
    return {
        "task": "Summarize this commit in plain English. Explain what changed, why it matters, identify important modified files, and suggest concrete review checks. Do not infer facts unsupported by the supplied data.",
        "commit": metadata,
        "files": files,
        "filesTruncated": bool(diff.get("filesTruncated")),
        "diffTruncated": bool(diff.get("diffTruncated")),
        "responseFormat": {
            "what_changed": "non-empty string",
            "why_it_matters": "non-empty string",
            "important_files": ["file paths from the supplied changed files"],
            "suggested_review_checks": ["concrete review checks"],
        },
    }


def _request_provider(
    endpoint: str, api_key: str, payload: dict, timeout: int, max_response_bytes: int
) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        endpoint,
        data=body,
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        response_body = response.read(max_response_bytes + 1)
    if len(response_body) > max_response_bytes:
        raise ValueError("provider response exceeded the configured limit")
    return json.loads(response_body.decode("utf-8"))


def _validate_summary(response: dict, changed_paths: set[str]) -> dict:
    if not isinstance(response, dict) or any(field not in response for field in _SUMMARY_FIELDS):
        raise ValueError("provider returned an invalid summary")

    normalized = {}
    for field in ("what_changed", "why_it_matters"):
        value = response[field]
        if not isinstance(value, str) or not value.strip() or len(value) > _MAX_SECTION_CHARS:
            raise ValueError("provider returned an invalid summary section")
        normalized[field] = value.strip()

    important_files = response["important_files"]
    checks = response["suggested_review_checks"]
    if not isinstance(important_files, list) or not isinstance(checks, list):
        raise ValueError("provider returned invalid summary lists")
    if (
        len(important_files) > _MAX_LIST_ITEMS
        or len(checks) > _MAX_LIST_ITEMS
        or not checks
        or (changed_paths and not important_files)
    ):
        raise ValueError("provider returned invalid summary lists")
    if any(
        not isinstance(path, str)
        or path not in changed_paths
        or len(path) > _MAX_PATH_CHARS
        for path in important_files
    ):
        raise ValueError("provider returned an unknown file path")
    if any(
        not isinstance(check, str)
        or not check.strip()
        or len(check) > _MAX_LIST_ITEM_CHARS
        for check in checks
    ):
        raise ValueError("provider returned an invalid review check")
    normalized["important_files"] = important_files
    normalized["suggested_review_checks"] = [check.strip() for check in checks]
    return normalized


def _format_summary(summary: dict) -> str:
    files = ", ".join(summary["important_files"]) or "None identified"
    checks = "\n".join(f"- {check}" for check in summary["suggested_review_checks"])
    return (
        f"What changed: {summary['what_changed']}\n"
        f"Why it matters: {summary['why_it_matters']}\n"
        f"Important files: {files}\n"
        f"Suggested review checks:\n{checks}"
    )


def _is_http_endpoint(endpoint: str) -> bool:
    if (
        not isinstance(endpoint, str)
        or not endpoint
        or any(char.isspace() for char in endpoint)
    ):
        return False
    try:
        parsed = urlparse(endpoint)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError:
        return False
    if not hostname or parsed.scheme not in {"http", "https"}:
        return False
    if parsed.scheme == "https":
        return True

    hostname = hostname.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith(".localhost"):
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def _unavailable(reason: str) -> dict:
    return {
        "available": False,
        "summary": f"AI unavailable: {reason}.",
        "whatChanged": None,
        "whyItMatters": None,
        "importantFiles": [],
        "suggestedReviewChecks": [],
    }

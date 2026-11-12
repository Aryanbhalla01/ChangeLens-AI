"""Deterministic local insights from bounded commit metadata and diffs."""

from .analysis_service import analyze_commit
from .diff_service import get_commit_diff
from .git_service import get_commit_details

_MAX_COMMIT_MESSAGE_CHARS = 2_000
_MAX_AUTHOR_CHARS = 200
_MAX_PATH_CHARS = 500
_MAX_SUMMARY_FILES = 5


def summarize_commit(repository_id: str, commit_hash: str) -> dict:
    """Return local, rule-based insights for one registered commit."""
    commit = get_commit_details(repository_id, commit_hash)
    diff = get_commit_diff(repository_id, commit_hash)
    analysis = analyze_commit(repository_id, commit_hash)

    message = str(commit.get("message") or "")[:_MAX_COMMIT_MESSAGE_CHARS]
    author = str(commit.get("author") or "")[:_MAX_AUTHOR_CHARS]
    changed_files = [
        {
            "path": str(item.get("path") or "")[:_MAX_PATH_CHARS],
            "previousPath": (
                str(item["previousPath"])[:_MAX_PATH_CHARS]
                if item.get("previousPath")
                else None
            ),
            "changeType": item["changeType"],
            "additions": item["additions"],
            "deletions": item["deletions"],
        }
        for item in diff["files"]
    ]
    metadata_files = commit["files"]
    counts = {
        "addedFileCount": sum(item["changeType"] == "added" for item in metadata_files),
        "modifiedFileCount": sum(
            item["changeType"] == "modified" for item in metadata_files
        ),
        "deletedFileCount": sum(
            item["changeType"] == "deleted" for item in metadata_files
        ),
        "renamedFileCount": sum(
            item["changeType"] == "renamed" for item in metadata_files
        ),
    }
    files_truncated = bool(commit["filesTruncated"] or diff["filesTruncated"])
    statistics = {
        "changedFileCount": commit["changedFileCount"],
        "insertions": commit["insertions"],
        "deletions": commit["deletions"],
        **counts,
        "filesTruncated": files_truncated,
        "diffTruncated": bool(diff["diffTruncated"]),
    }

    message_subject = message.splitlines()[0] if message else "(no commit message)"
    if commit["changedFileCount"] == 0:
        what_changed = (
            f'Commit "{message_subject}" by {author or "unknown author"} changed no files. '
            "The available diff is empty."
        )
        why_it_matters = "No files changed, so there is no diff-based impact to describe."
    else:
        file_count = commit["changedFileCount"]
        if file_count is None:
            file_count = len(metadata_files)
        line_summary = (
            f'{commit["insertions"]} insertions and {commit["deletions"]} deletions'
            if commit["statsAvailable"]
            else "line counts unavailable"
        )
        listed_counts = (
            "The bounded file list includes "
            if files_truncated
            else "The commit contains "
        )
        what_changed = (
            f'Commit "{message_subject}" by {author or "unknown author"} changed '
            f"{file_count} file(s). {listed_counts}"
            f'{counts["addedFileCount"]} added, {counts["modifiedFileCount"]} modified, '
            f'{counts["deletedFileCount"]} deleted, and {counts["renamedFileCount"]} renamed. '
            f"The available commit statistics report {line_summary}."
        )
        why_it_matters = (
            f"The commit records changes to {file_count} file(s) and "
            f"{line_summary}. This describes available Git metadata; "
            "it does not infer runtime behavior."
        )
        if files_truncated or diff["diffTruncated"]:
            why_it_matters += " Some file or diff data was omitted by configured limits."

    if not changed_files:
        review_checks = []
    else:
        review_checks = [
            f"Review the available diff for {item['path']}."
            for item in changed_files[:_MAX_SUMMARY_FILES]
        ]
    important_files = [
        item["path"] for item in changed_files[:_MAX_SUMMARY_FILES]
    ]
    findings = analysis["findings"]
    summary = (
        f"Local, rule-based insights\n"
        f"{what_changed}\n"
        f"Existing static-analysis findings: {len(findings)} in the available analysis."
    )

    return {
        "available": True,
        "summary": summary,
        "whatChanged": what_changed,
        "whyItMatters": why_it_matters,
        "importantFiles": important_files,
        "suggestedReviewChecks": review_checks,
        "source": "local_rules",
        "label": "Local, rule-based insights",
        "commitMessage": message,
        "author": author,
        "filesChanged": changed_files,
        "statistics": statistics,
        "riskFindings": findings,
        "findingsTruncated": bool(analysis["summary"]["truncated"]),
    }

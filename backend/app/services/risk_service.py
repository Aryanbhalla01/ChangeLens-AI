"""Deterministic, explainable risk scoring for commit changes."""

from math import ceil

from .analysis_service import analyze_commit
from .diff_service import get_commit_diff

_FILE_COUNT_CAP = 5
_LINES_PER_POINT = 20
_LINE_COUNT_CAP = 500
_SEVERITY_POINTS = {
    "critical": 10,
    "error": 8,
    "warning": 5,
    "notice": 2,
    "info": 1,
}
_SENSITIVE_PATHS = (
    ("credential material", 12),
    ("authentication and security", 8),
    ("deployment and infrastructure", 5),
)
_CREDENTIAL_SEGMENTS = {"secrets", "credentials"}
_AUTH_SEGMENTS = {
    "access-control",
    "auth",
    "authentication",
    "identity",
    "permissions",
    "security",
}
_INFRASTRUCTURE_SEGMENTS = {
    "deploy",
    "deployment",
    "docker",
    "helm",
    "infra",
    "infrastructure",
    "k8s",
    "kubernetes",
    "terraform",
}
_SENSITIVE_EXTENSIONS = {".key", ".pem", ".p12", ".pfx", ".crt", ".cer"}
_PRIVATE_KEY_NAMES = {"id_rsa", "id_ed25519"}


def assess_commit_risk(repository_id: str, commit_hash: str) -> dict:
    """Score commit changes using bounded diff metrics and static-analysis findings."""
    diff_data = get_commit_diff(repository_id, commit_hash)
    analysis_data = analyze_commit(repository_id, commit_hash)
    files = diff_data["files"]
    file_count = len(files)
    additions = 0
    deletions = 0
    unavailable_line_counts = 0
    for changed_file in files:
        if changed_file["additions"] is None or changed_file["deletions"] is None:
            unavailable_line_counts += 1
            continue
        additions += changed_file["additions"]
        deletions += changed_file["deletions"]

    changed_lines = additions + deletions
    line_score = min(
        _LINE_COUNT_CAP // _LINES_PER_POINT,
        ceil(min(changed_lines, _LINE_COUNT_CAP) / _LINES_PER_POINT),
    )
    file_score = min(file_count, _FILE_COUNT_CAP) * 5
    sensitive_details = _sensitive_path_contribution(files)
    static_details = _finding_contribution(analysis_data["findings"])

    factors = [
        {
            "name": "changedFiles",
            "score": file_score,
            "maxScore": 25,
            "value": file_count,
            "explanation": (
                f"{file_count} changed file(s); 5 points per file, capped at "
                f"{_FILE_COUNT_CAP} files."
            ),
        },
        {
            "name": "changedLines",
            "score": line_score,
            "maxScore": 25,
            "additions": additions,
            "deletions": deletions,
            "unavailableFileCount": unavailable_line_counts,
            "explanation": (
                f"{changed_lines} added/deleted line(s) with available counts; "
                f"1 point per {_LINES_PER_POINT} lines, capped at {_LINE_COUNT_CAP} lines."
            ),
        },
        {
            "name": "sensitivePaths",
            "score": sensitive_details["score"],
            "maxScore": 25,
            "categories": sensitive_details["categories"],
            "explanation": "Sensitive-path categories add bounded points when matched.",
        },
        {
            "name": "staticFindings",
            "score": static_details["score"],
            "maxScore": 25,
            "severityCounts": static_details["severityCounts"],
            "removedFindingsExcluded": static_details["removedFindingsExcluded"],
            "explanation": (
                "Introduced findings add points by severity; removed findings do not "
                "increase risk."
            ),
        },
    ]
    score = min(100, max(0, sum(factor["score"] for factor in factors)))

    limitations = [
        "This score is a heuristic, NOT a probability of bugs.",
        "Static analysis is limited to the existing lexical rules and does not establish correctness or exploitability.",
        "Diff files, changed lines, and findings are bounded by configured limits; truncation can understate risk.",
    ]
    if unavailable_line_counts:
        limitations.append(
            "Line counts for binary, oversized, or otherwise unavailable diffs are excluded from the line-volume factor."
        )
    if diff_data["diffTruncated"] or analysis_data["summary"]["truncated"]:
        limitations.append(
            "The diff or static-analysis results were truncated by configured limits for this commit."
        )

    return {
        "commit": diff_data["targetCommit"],
        "baseCommit": diff_data["baseCommit"],
        "score": score,
        "classification": _classify_score(score),
        "heuristic": True,
        "disclaimer": "This score is a heuristic, NOT a probability of bugs.",
        "factors": factors,
        "limitations": limitations,
        "limits": {
            "maxFiles": diff_data["limits"]["maxFiles"],
            "maxDiffResponseBytes": diff_data["limits"]["maxDiffResponseBytes"],
            "maxChangedLines": analysis_data["limits"]["maxChangedLines"],
            "maxFindings": analysis_data["limits"]["maxFindings"],
        },
    }


def _sensitive_path_contribution(files: list[dict]) -> dict:
    matched_paths = {name: [] for name, _ in _SENSITIVE_PATHS}
    for changed_file in files:
        path = changed_file["path"].replace("\\", "/").casefold()
        segments = path.split("/")
        basename = segments[-1]
        extension = "." + basename.rsplit(".", 1)[-1] if "." in basename else ""
        if (
            basename.startswith(".env")
            or basename in _PRIVATE_KEY_NAMES
            or extension in _SENSITIVE_EXTENSIONS
            or _CREDENTIAL_SEGMENTS.intersection(segments)
        ):
            matched_paths["credential material"].append(changed_file["path"])
        if _AUTH_SEGMENTS.intersection(segments):
            matched_paths["authentication and security"].append(changed_file["path"])
        if (
            _INFRASTRUCTURE_SEGMENTS.intersection(segments)
            or path.startswith(".github/workflows/")
            or basename in {"dockerfile", "docker-compose.yml"}
        ):
            matched_paths["deployment and infrastructure"].append(changed_file["path"])

    categories = []
    total = 0
    for name, points in _SENSITIVE_PATHS:
        paths = matched_paths[name]
        if paths:
            total += points
            categories.append(
                {"name": name, "score": points, "matchedPaths": sorted(set(paths))}
            )
    return {"score": min(25, total), "categories": categories}


def _finding_contribution(findings: list[dict]) -> dict:
    severity_counts: dict[str, int] = {}
    removed_count = 0
    score = 0
    for finding in findings:
        if finding.get("findingDisposition") == "removed":
            removed_count += 1
            continue
        severity = str(finding.get("severity", "")).casefold()
        points = _SEVERITY_POINTS.get(severity, 0)
        if points == 0:
            continue
        severity_counts[severity] = severity_counts.get(severity, 0) + 1
        score = min(25, score + points)
    return {
        "score": score,
        "severityCounts": severity_counts,
        "removedFindingsExcluded": removed_count,
    }


def _classify_score(score: int) -> str:
    if score < 25:
        return "low"
    if score < 50:
        return "moderate"
    if score < 75:
        return "high"
    return "critical"

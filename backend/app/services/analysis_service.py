"""Deterministic, bounded checks for changed Python source lines."""

import re

from flask import current_app

from .diff_service import get_commit_diff

_HUNK_HEADER = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@")
_RULES = (
    {
        "id": "PY001",
        "title": "Dynamic code execution",
        "pattern": re.compile(r"\b(?:eval|exec)\s*\("),
        "severity": "warning",
        "explanation": "Evaluating dynamically supplied code can execute unintended operations. Validate or avoid dynamic code input.",
    },
    {
        "id": "PY002",
        "title": "Subprocess uses a shell",
        "pattern": re.compile(
            r"\bsubprocess\.(?:run|call|Popen|check_call|check_output)\s*\(.*\bshell\s*=\s*True\b"
        ),
        "severity": "warning",
        "explanation": "Shell interpretation can make command construction sensitive to untrusted input. Prefer argument lists without shell mode.",
    },
    {
        "id": "PY003",
        "title": "Bare exception handler",
        "pattern": re.compile(r"^\s*except\s*:\s*(?:#.*)?$"),
        "severity": "notice",
        "explanation": "A bare exception handler catches every exception, which can hide failures and process-control signals. Catch expected exception types.",
    },
    {
        "id": "PY004",
        "title": "Credential-like literal assignment",
        "pattern": re.compile(
            r"\b(?:password|passwd|secret|api[_-]?key|token)\b\s*=\s*(['\"])([^'\"]{4,})\1",
            re.IGNORECASE,
        ),
        "severity": "warning",
        "explanation": "A credential-like value appears as a source literal. Avoid committing real secrets; use a secret store or environment configuration.",
    },
)
_MAX_EVIDENCE_CHARS = 1_000


def analyze_commit(repository_id: str, commit_hash: str) -> dict:
    """Analyze changed Python files against a small set of lexical rules."""
    diff_data = get_commit_diff(repository_id, commit_hash, python_only=True)
    max_changed_lines = current_app.config["MAX_ANALYSIS_CHANGED_LINES"]
    max_findings = current_app.config["MAX_ANALYSIS_FINDINGS"]
    changed_lines_remaining = max_changed_lines
    files = []
    findings = []
    changed_lines_truncated = False
    findings_truncated = False
    analyzed_files = 0

    for changed_file in diff_data["files"]:
        is_binary = changed_file["binary"]
        is_truncated = changed_file["truncated"]
        analyzable = not is_binary and not is_truncated
        file_result = {
            "path": changed_file["path"],
            "previousPath": changed_file["previousPath"],
            "changeType": changed_file["changeType"],
            "additions": changed_file["additions"],
            "deletions": changed_file["deletions"],
            "binary": is_binary,
            "truncated": is_truncated,
            "analyzable": analyzable,
            "changedLines": [],
        }
        if analyzable:
            analyzed_files += 1
            for change, line_number, content in _changed_lines(changed_file["diff"]):
                matched_rules = _matching_rules(content)
                if changed_lines_remaining > 0:
                    content, content_truncated = _bounded_evidence(content)
                    file_result["changedLines"].append(
                        {
                            "lineNumber": line_number,
                            "lineSide": "new" if change == "added" else "old",
                            "change": change,
                            "content": content,
                            "contentTruncated": content_truncated,
                        }
                    )
                    changed_lines_remaining -= 1
                else:
                    changed_lines_truncated = True

                for rule in matched_rules:
                    if len(findings) >= max_findings:
                        findings_truncated = True
                        continue
                    evidence, evidence_truncated = _bounded_evidence(content)
                    findings.append(
                        {
                            "ruleId": rule["id"],
                            "title": rule["title"],
                            "severity": rule["severity"],
                            "path": changed_file["path"],
                            "previousPath": changed_file["previousPath"],
                            "lineNumber": line_number,
                            "lineSide": "new" if change == "added" else "old",
                            "change": change,
                            "explanation": rule["explanation"],
                            "evidence": evidence,
                            "evidenceTruncated": evidence_truncated,
                        }
                    )
        files.append(file_result)

    files_truncated = diff_data["filesTruncated"]
    diff_truncated = any(item["truncated"] for item in diff_data["files"])
    return {
        "commit": diff_data["targetCommit"],
        "baseCommit": diff_data["baseCommit"],
        "baseStrategy": "first_parent" if diff_data["baseCommit"] else "empty_tree",
        "files": files,
        "findings": findings,
        "summary": {
            "pythonFiles": len(diff_data["files"]),
            "analyzedFiles": analyzed_files,
            "findingCount": len(findings),
            "filesTruncated": files_truncated,
            "diffTruncated": diff_truncated,
            "changedLinesTruncated": changed_lines_truncated,
            "findingsTruncated": findings_truncated,
            "truncated": (
                files_truncated
                or diff_truncated
                or changed_lines_truncated
                or findings_truncated
            ),
        },
        "limits": {
            "maxFiles": current_app.config["MAX_COMPARE_FILES"],
            "maxChangedLines": max_changed_lines,
            "maxFindings": max_findings,
        },
    }


def _changed_lines(diff_text: str):
    old_line = 0
    new_line = 0
    in_hunk = False
    for line in diff_text.splitlines():
        match = _HUNK_HEADER.match(line)
        if match:
            old_line = int(match.group(1))
            new_line = int(match.group(2))
            in_hunk = True
            continue
        if not in_hunk or line.startswith("\\"):
            continue
        if line.startswith("+") and not line.startswith("+++"):
            yield "added", new_line, line[1:]
            new_line += 1
        elif line.startswith("-") and not line.startswith("---"):
            yield "deleted", old_line, line[1:]
            old_line += 1
        elif line.startswith(" "):
            old_line += 1
            new_line += 1


def _matching_rules(content: str) -> list[dict]:
    stripped = content.strip()
    if not stripped or stripped.startswith("#"):
        return []
    return [rule for rule in _RULES if rule["pattern"].search(content)]


def _bounded_evidence(content: str) -> tuple[str, bool]:
    if len(content) <= _MAX_EVIDENCE_CHARS:
        return content, False
    return content[:_MAX_EVIDENCE_CHARS], True

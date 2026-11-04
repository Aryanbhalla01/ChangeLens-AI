"""Deterministic, bounded checks for changed Python source lines."""

import io
import re
import tokenize

from flask import current_app

from .diff_service import get_commit_diff

_HUNK_HEADER = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@")
_SUBPROCESS_METHODS = {"run", "call", "Popen", "check_call", "check_output"}
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
        "detector": "subprocess_shell_argument",
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
        "explanation": "Heuristic warning only: a credential-like name is assigned a string literal. This is not proof that the value is a real or exposed secret; review it before taking action.",
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
            subprocess_shell_lines = _subprocess_shell_lines(changed_file["diff"])
            for change, line_number, content in _changed_lines(changed_file["diff"]):
                matched_rules = _matching_rules(
                    content,
                    change=change,
                    line_number=line_number,
                    subprocess_shell_lines=subprocess_shell_lines,
                )
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
                            "findingDisposition": (
                                "introduced" if change == "added" else "removed"
                            ),
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


def _matching_rules(
    content: str,
    *,
    change: str,
    line_number: int,
    subprocess_shell_lines: set[tuple[str, int]],
) -> list[dict]:
    stripped = content.strip()
    if not stripped or stripped.startswith("#"):
        return []
    matched = []
    for rule in _RULES:
        detector = rule.get("detector")
        if detector == "subprocess_shell_argument":
            if (change, line_number) in subprocess_shell_lines:
                matched.append(rule)
        elif rule.get("pattern") and rule["pattern"].search(content):
            matched.append(rule)
    return matched


def _subprocess_shell_lines(diff_text: str) -> set[tuple[str, int]]:
    """Find changed shell=True arguments inside bounded subprocess call hunks."""
    findings: set[tuple[str, int]] = set()
    old_lines: list[tuple[int, str, bool]] = []
    new_lines: list[tuple[int, str, bool]] = []
    old_line = 0
    new_line = 0

    def scan_hunk() -> None:
        findings.update(_scan_subprocess_side("deleted", old_lines))
        findings.update(_scan_subprocess_side("added", new_lines))
        old_lines.clear()
        new_lines.clear()

    for line in diff_text.splitlines():
        header = _HUNK_HEADER.match(line)
        if header:
            scan_hunk()
            old_line = int(header.group(1))
            new_line = int(header.group(2))
            continue
        if line.startswith("\\"):
            continue
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            new_lines.append((new_line, line[1:], True))
            new_line += 1
        elif line.startswith("-"):
            old_lines.append((old_line, line[1:], True))
            old_line += 1
        elif line.startswith(" "):
            old_lines.append((old_line, line[1:], False))
            new_lines.append((new_line, line[1:], False))
            old_line += 1
            new_line += 1
    scan_hunk()
    return findings


def _scan_subprocess_side(
    change: str, source_lines: list[tuple[int, str, bool]]
) -> set[tuple[str, int]]:
    if not source_lines:
        return set()
    source = "".join(f"{line}\n" for _, line, _ in source_lines)
    line_metadata = {
        index + 1: (line_number, changed)
        for index, (line_number, _, changed) in enumerate(source_lines)
    }
    tokens = []
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            tokens.append(token)
    except (tokenize.TokenError, IndentationError, SyntaxError):
        # Tokenization may stop at a hunk boundary; tokens emitted before that point
        # are still useful for complete calls contained in the available context.
        pass

    significant = [
        item
        for item in tokens
        if item.type
        not in {
            tokenize.ENCODING,
            tokenize.INDENT,
            tokenize.DEDENT,
            tokenize.NL,
            tokenize.NEWLINE,
            tokenize.COMMENT,
            tokenize.ENDMARKER,
        }
    ]
    result: set[tuple[str, int]] = set()
    index = 0
    while index + 3 < len(significant):
        if not (
            significant[index].type == tokenize.NAME
            and significant[index].string == "subprocess"
            and significant[index + 1].type == tokenize.OP
            and significant[index + 1].string == "."
            and significant[index + 2].type == tokenize.NAME
            and significant[index + 2].string in _SUBPROCESS_METHODS
            and significant[index + 3].type == tokenize.OP
            and significant[index + 3].string == "("
        ):
            index += 1
            continue

        depth = 1
        cursor = index + 4
        while cursor < len(significant) and depth:
            token = significant[cursor]
            if (
                depth == 1
                and token.type == tokenize.NAME
                and token.string == "shell"
                and cursor + 2 < len(significant)
                and significant[cursor + 1].type == tokenize.OP
                and significant[cursor + 1].string == "="
                and significant[cursor + 2].type == tokenize.NAME
                and significant[cursor + 2].string == "True"
            ):
                source_line, changed = line_metadata.get(token.start[0], (0, False))
                if changed:
                    result.add((change, source_line))
            if token.type == tokenize.OP:
                if token.string in "([{":
                    depth += 1
                elif token.string in ")]}":
                    depth -= 1
            cursor += 1
        index = cursor
    return result


def _bounded_evidence(content: str) -> tuple[str, bool]:
    if len(content) <= _MAX_EVIDENCE_CHARS:
        return content, False
    return content[:_MAX_EVIDENCE_CHARS], True

from app.services.ai_summary_service import summarize_commit


def test_summary_includes_local_commit_metadata_stats_and_files(
    app, repository, connected_repository
):
    with app.app_context():
        result = summarize_commit(
            connected_repository["id"], repository["second"].hexsha
        )

    assert result["available"] is True
    assert result["source"] == "local_rules"
    assert result["label"] == "Local, rule-based insights"
    assert result["commitMessage"] == "Add a line and file"
    assert result["author"] == "Test Author"
    assert result["statistics"] == {
        "changedFileCount": 2,
        "insertions": 2,
        "deletions": 0,
        "addedFileCount": 1,
        "modifiedFileCount": 1,
        "deletedFileCount": 0,
        "renamedFileCount": 0,
        "filesTruncated": False,
        "diffTruncated": False,
    }
    assert {item["path"] for item in result["filesChanged"]} == {
        "README.md",
        "added.txt",
    }
    assert "Add a line and file" in result["whatChanged"]
    assert "Test Author" in result["whatChanged"]
    assert "does not infer runtime behavior" in result["whyItMatters"]
    assert result["importantFiles"] == ["README.md", "added.txt"]
    assert result["suggestedReviewChecks"] == [
        "Review the available diff for README.md.",
        "Review the available diff for added.txt.",
    ]


def test_summary_handles_empty_commit_without_inventing_changes(
    app, repository, connected_repository
):
    repository["repo"].index.commit("Empty commit")
    empty_hash = repository["repo"].head.commit.hexsha

    with app.app_context():
        result = summarize_commit(connected_repository["id"], empty_hash)

    assert result["available"] is True
    assert result["commitMessage"] == "Empty commit"
    assert result["statistics"]["changedFileCount"] == 0
    assert result["statistics"]["insertions"] == 0
    assert result["statistics"]["deletions"] == 0
    assert result["filesChanged"] == []
    assert result["importantFiles"] == []
    assert result["suggestedReviewChecks"] == []
    assert "changed no files" in result["whatChanged"]
    assert "diff is empty" in result["whatChanged"]


def test_summary_reports_deleted_files_and_deletion_counts(
    app, repository, connected_repository
):
    with app.app_context():
        result = summarize_commit(
            connected_repository["id"], repository["third"].hexsha
        )

    assert result["statistics"]["changedFileCount"] == 1
    assert result["statistics"]["addedFileCount"] == 0
    assert result["statistics"]["modifiedFileCount"] == 0
    assert result["statistics"]["deletedFileCount"] == 1
    assert result["statistics"]["insertions"] == 0
    assert result["statistics"]["deletions"] == 1
    assert result["filesChanged"] == [
        {
            "path": "added.txt",
            "previousPath": None,
            "changeType": "deleted",
            "additions": 0,
            "deletions": 1,
        }
    ]


def test_summary_includes_existing_static_analysis_findings(
    app, repository, connected_repository, monkeypatch
):
    finding = {
        "ruleId": "PY003",
        "title": "Bare exception handler",
        "severity": "notice",
        "path": "changed.py",
        "lineNumber": 3,
        "findingDisposition": "introduced",
    }
    monkeypatch.setattr(
        "app.services.ai_summary_service.analyze_commit",
        lambda *_args: {"findings": [finding], "summary": {"truncated": False}},
    )

    with app.app_context():
        result = summarize_commit(
            connected_repository["id"], repository["second"].hexsha
        )

    assert result["riskFindings"] == [finding]
    assert result["findingsTruncated"] is False
    assert "Existing static-analysis findings: 1" in result["summary"]


def test_summary_respects_file_and_diff_limits_for_large_commits(
    app, repository, connected_repository
):
    repo = repository["repo"]
    for index in range(4):
        path = repository["path"] / f"large-{index}.txt"
        path.write_text(("large diff line\n" * 20), encoding="utf-8")
        repo.index.add([path.name])
    large_commit = repo.index.commit("Add several large files")
    app.config.update(
        MAX_COMMIT_FILES=2,
        MAX_COMPARE_FILES=2,
        MAX_DIFF_RESPONSE_BYTES=32,
        MAX_FILE_DIFF_BYTES=32,
    )

    with app.app_context():
        result = summarize_commit(connected_repository["id"], large_commit.hexsha)

    assert result["statistics"]["changedFileCount"] == 4
    assert result["statistics"]["filesTruncated"] is True
    assert result["statistics"]["diffTruncated"] is True
    assert len(result["filesChanged"]) <= 2
    assert "bounded file list" in result["whatChanged"]
    assert "omitted by configured limits" in result["whyItMatters"]


from git import Repo


def _commit(repository, message, writes=None, deletions=None):
    writes = writes or {}
    deletions = deletions or []
    for relative_path, content in writes.items():
        path = repository["path"] / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        repository["repo"].index.add([relative_path])
    for relative_path in deletions:
        (repository["path"] / relative_path).unlink()
        repository["repo"].index.remove([relative_path])
    return repository["repo"].index.commit(message)


def _analysis(client, repository_id, commit):
    return client.get(
        f"/api/repositories/{repository_id}/commits/{commit.hexsha}/analysis"
    )


def test_analysis_reports_changed_python_lines_and_rule_evidence(
    client, repository, connected_repository
):
    commit = _commit(
        repository,
        "Add Python dynamic execution",
        {
            "check.py": "result = eval(user_input)\n",
            "notes.txt": "not Python source\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert [item["path"] for item in payload["files"]] == ["check.py"]
    assert payload["files"][0]["changeType"] == "added"
    assert payload["files"][0]["changedLines"] == [
        {
            "lineNumber": 1,
            "lineSide": "new",
            "change": "added",
            "content": "result = eval(user_input)",
            "contentTruncated": False,
        }
    ]
    assert len(payload["findings"]) == 1
    finding = payload["findings"][0]
    assert (finding["ruleId"], finding["path"], finding["lineNumber"]) == (
        "PY001",
        "check.py",
        1,
    )
    assert finding["lineSide"] == "new"
    assert finding["change"] == "added"
    assert finding["evidence"] == "result = eval(user_input)"
    assert finding["evidenceTruncated"] is False


def test_analysis_applies_all_documented_pattern_rules(
    client, repository, connected_repository
):
    source = (
        "subprocess.run(command, shell=True)\n"
        "try:\n"
        "    run()\n"
        "except:\n"
        "    pass\n"
        'password = "hardcoded-value"\n'
    )
    commit = _commit(repository, "Add potentially problematic patterns", {"patterns.py": source})

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    findings = response.get_json()["data"]["findings"]
    assert [(item["ruleId"], item["lineNumber"]) for item in findings] == [
        ("PY002", 1),
        ("PY003", 4),
        ("PY004", 6),
    ]


def test_analysis_uses_old_and_new_line_numbers_for_modified_code(
    client, repository, connected_repository
):
    _commit(repository, "Add Python source", {"sample.py": "before = True\nresult = value\n"})
    changed = _commit(
        repository,
        "Use dynamic execution",
        {"sample.py": "before = True\nresult = eval(value)\n"},
    )

    response = _analysis(client, connected_repository["id"], changed)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    file_result = payload["files"][0]
    assert file_result["changeType"] == "modified"
    assert file_result["changedLines"] == [
        {
            "lineNumber": 2,
            "lineSide": "old",
            "change": "deleted",
            "content": "result = value",
            "contentTruncated": False,
        },
        {
            "lineNumber": 2,
            "lineSide": "new",
            "change": "added",
            "content": "result = eval(value)",
            "contentTruncated": False,
        },
    ]
    finding = payload["findings"][0]
    assert (finding["ruleId"], finding["lineNumber"], finding["lineSide"]) == (
        "PY001",
        2,
        "new",
    )


def test_analysis_handles_renames_and_deleted_python_files(
    client, repository, connected_repository
):
    _commit(repository, "Add old Python path", {"old.py": "result = eval(value)\n"})
    (repository["path"] / "old.py").replace(repository["path"] / "new.py")
    repository["repo"].index.remove(["old.py"])
    repository["repo"].index.add(["new.py"])
    renamed = repository["repo"].index.commit("Rename Python file")

    rename_response = _analysis(client, connected_repository["id"], renamed)
    assert rename_response.status_code == 200
    renamed_file = rename_response.get_json()["data"]["files"][0]
    assert renamed_file["changeType"] == "renamed"
    assert renamed_file["path"] == "new.py"
    assert renamed_file["previousPath"] == "old.py"

    deleted = _commit(
        repository, "Delete Python file", deletions=["new.py"]
    )
    delete_response = _analysis(client, connected_repository["id"], deleted)
    assert delete_response.status_code == 200
    deleted_payload = delete_response.get_json()["data"]
    assert deleted_payload["files"][0]["changeType"] == "deleted"
    assert deleted_payload["files"][0]["changedLines"][0]["lineSide"] == "old"
    assert deleted_payload["findings"][0]["change"] == "deleted"


def test_analysis_handles_root_commits(client, app):
    path = app.config["TEST_APPROVED_ROOT"] / "root-analysis"
    path.mkdir()
    repository = Repo.init(path)
    with repository.config_writer() as config:
        config.set_value("user", "name", "Test Author")
        config.set_value("user", "email", "test@example.invalid")
    (path / "root.py").write_text("result = eval(source)\n", encoding="utf-8")
    repository.index.add(["root.py"])
    commit = repository.index.commit("Initial Python commit")
    connected = client.post(
        "/api/repositories/connect", json={"path": str(path)}
    ).get_json()["data"]

    response = _analysis(client, connected["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["baseCommit"] is None
    assert payload["baseStrategy"] == "empty_tree"
    assert payload["files"][0]["changeType"] == "added"
    assert payload["findings"][0]["evidence"] == "result = eval(source)"


def test_analysis_uses_first_parent_for_merge_commits(
    client, repository, connected_repository
):
    first_parent = _commit(
        repository, "Add first parent Python file", {"first.py": "one = 1\n"}
    )
    second_parent = _commit(
        repository, "Add second parent Python file", {"second.py": "two = 2\n"}
    )
    merge = repository["repo"].index.commit(
        "Merge Python changes", parent_commits=[first_parent, second_parent]
    )

    response = _analysis(client, connected_repository["id"], merge)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["baseStrategy"] == "first_parent"
    assert payload["baseCommit"]["hash"] == first_parent.hexsha
    assert [item["path"] for item in payload["files"]] == ["second.py"]


def test_analysis_marks_binary_and_oversized_python_inputs(
    client, app, repository, connected_repository
):
    app.config["MAX_BLOB_READ_BYTES"] = 8
    (repository["path"] / "binary.py").write_bytes(b"\x00\x01")
    (repository["path"] / "large.py").write_text("value = 123456789\n", encoding="utf-8")
    repository["repo"].index.add(["binary.py", "large.py"])
    commit = repository["repo"].index.commit("Add non-analyzable Python files")

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    files = {item["path"]: item for item in payload["files"]}
    assert files["binary.py"]["binary"] is True
    assert files["binary.py"]["analyzable"] is False
    assert files["large.py"]["truncated"] is True
    assert files["large.py"]["analyzable"] is False
    assert payload["summary"]["truncated"] is True


def test_analysis_reports_changed_line_and_finding_caps(
    client, app, repository, connected_repository
):
    app.config["MAX_ANALYSIS_CHANGED_LINES"] = 1
    app.config["MAX_ANALYSIS_FINDINGS"] = 1
    commit = _commit(
        repository,
        "Add multiple dynamic execution lines",
        {"checks.py": "first = eval(value)\nsecond = exec(source)\n"},
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert len(payload["files"][0]["changedLines"]) == 1
    assert len(payload["findings"]) == 1
    assert payload["summary"]["changedLinesTruncated"] is True
    assert payload["summary"]["findingsTruncated"] is True
    assert payload["summary"]["truncated"] is True


def test_analysis_reports_file_scan_truncation(
    client, app, repository, connected_repository
):
    app.config["MAX_COMPARE_FILES"] = 1
    commit = _commit(
        repository,
        "Add multiple Python files",
        {"one.py": "one = 1\n", "two.py": "two = 2\n"},
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert len(payload["files"]) == 1
    assert payload["summary"]["filesTruncated"] is True
    assert payload["summary"]["truncated"] is True


def test_analysis_rejects_invalid_commit_hash(client, connected_repository):
    response = client.get(
        f"/api/repositories/{connected_repository['id']}"
        "/commits/not-a-revision/analysis"
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_COMMIT_HASH"

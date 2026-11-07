import ast

from git import Repo


def _commit(repository, files):
    for relative_path, content in files.items():
        path = repository["path"] / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        repository["repo"].index.add([relative_path])
    return repository["repo"].index.commit("Update dependency graph")


def _analysis(client, repository_id, commit):
    return client.get(
        f"/api/repositories/{repository_id}/commits/{commit.hexsha}/dependencies"
    )


def test_dependency_endpoint_reports_absolute_and_relative_imports(
    client, repository, connected_repository
):
    commit = _commit(
        repository,
        {
            "pkg/__init__.py": "",
            "pkg/target.py": "VALUE = 1\n",
            "pkg/sibling.py": "VALUE = 2\n",
            "pkg/absolute_user.py": "import pkg.target\n",
            "pkg/relative_user.py": "from .target import VALUE\n",
            "pkg/relative_package_user.py": "from . import sibling\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    edges = {(edge["from"], edge["to"]) for edge in payload["graph"]["edges"]}
    assert ("pkg/absolute_user.py", "pkg/target.py") in edges
    assert ("pkg/relative_user.py", "pkg/target.py") in edges
    assert ("pkg/relative_package_user.py", "pkg/__init__.py") in edges
    assert ("pkg/relative_package_user.py", "pkg/sibling.py") in edges
    assert not payload["unresolvedImports"]
    assert payload["summary"]["syntaxErrorCount"] == 0


def test_dependency_endpoint_prefers_exact_module_over_package_fallback(
    client, repository, connected_repository
):
    commit = _commit(
        repository,
        {
            "pkg/__init__.py": "",
            "pkg/mod.py": "VALUE = 1\n",
            "pkg/mod/__init__.py": "VALUE = 2\n",
            "consumer.py": "import pkg.mod\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    edges = {(edge["from"], edge["to"]) for edge in payload["graph"]["edges"]}
    assert ("consumer.py", "pkg/mod.py") in edges
    assert ("consumer.py", "pkg/mod/__init__.py") not in edges
    assert not payload["unresolvedImports"]


def test_dependency_endpoint_preserves_repository_and_commit_errors(
    client, repository, connected_repository
):
    missing_repository = client.get(
        f"/api/repositories/missing/commits/{repository['second'].hexsha}/dependencies"
    )
    invalid_commit = client.get(
        f"/api/repositories/{connected_repository['id']}/commits/not-a-hash/dependencies"
    )

    assert missing_repository.status_code == 404
    assert missing_repository.get_json()["error"]["code"] == "REPOSITORY_NOT_FOUND"
    assert invalid_commit.status_code == 400
    assert invalid_commit.get_json()["error"]["code"] == "INVALID_COMMIT_HASH"


def test_dependency_endpoint_reports_direct_and_indirect_dependents(
    client, repository, connected_repository
):
    _commit(
        repository,
        {
            "a.py": "import b\n",
            "b.py": "import c\n",
            "c.py": "VALUE = 1\n",
        },
    )
    changed = _commit(repository, {"c.py": "VALUE = 2\n"})

    response = _analysis(client, connected_repository["id"], changed)

    assert response.status_code == 200
    graph = response.get_json()["data"]["graph"]
    assert graph["directDependents"] == [{"path": "b.py", "depth": 1}]
    assert graph["indirectDependents"] == [{"path": "a.py", "depth": 2}]


def test_dependency_endpoint_handles_cycles_without_duplicate_dependents(
    client, repository, connected_repository
):
    _commit(
        repository,
        {
            "a.py": "import b\nVALUE = 1\n",
            "b.py": "import a\n",
        },
    )
    changed = _commit(repository, {"a.py": "import b\nVALUE = 2\n"})

    response = _analysis(client, connected_repository["id"], changed)

    assert response.status_code == 200
    graph = response.get_json()["data"]["graph"]
    assert graph["directDependents"] == [{"path": "b.py", "depth": 1}]
    assert graph["indirectDependents"] == []


def test_dependency_endpoint_finds_dependents_of_deleted_modules(
    client, repository, connected_repository
):
    _commit(
        repository,
        {
            "consumer.py": "import removed_module\n",
            "removed_module.py": "VALUE = 1\n",
        },
    )
    (repository["path"] / "removed_module.py").unlink()
    repository["repo"].index.remove(["removed_module.py"])
    deleted = repository["repo"].index.commit("Delete imported module")

    response = _analysis(client, connected_repository["id"], deleted)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["changedFiles"] == ["removed_module.py"]
    assert payload["graph"]["directDependents"] == [
        {"path": "consumer.py", "depth": 1}
    ]
    assert {
        "path": "removed_module.py",
        "module": "removed_module",
        "present": False,
    } in payload["graph"]["nodes"]


def test_dependency_endpoint_finds_dependents_of_renamed_modules(
    client, repository, connected_repository
):
    _commit(
        repository,
        {
            "consumer.py": "import old_module\n",
            "old_module.py": "VALUE = 1\n",
        },
    )
    (repository["path"] / "old_module.py").rename(
        repository["path"] / "new_module.py"
    )
    repository["repo"].index.remove(["old_module.py"])
    repository["repo"].index.add(["new_module.py"])
    renamed = repository["repo"].index.commit("Rename imported module")

    response = _analysis(client, connected_repository["id"], renamed)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["changedFiles"] == ["new_module.py", "old_module.py"]
    assert payload["graph"]["directDependents"] == [
        {"path": "consumer.py", "depth": 1}
    ]


def test_dependency_endpoint_reports_syntax_errors_and_unresolved_imports(
    client, repository, connected_repository
):
    commit = _commit(
        repository,
        {
            "broken.py": "def broken(:\n    pass\n",
            "imports.py": "import missing_dependency\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["syntaxErrors"] == [
        {
            "path": "broken.py",
            "line": 1,
            "message": "invalid syntax",
        }
    ]
    assert payload["unresolvedImports"] == [
        {
            "path": "imports.py",
            "module": "missing_dependency",
            "level": 0,
            "reason": "not_found_in_commit",
            "candidates": [],
        }
    ]


def test_dependency_endpoint_reports_ambiguous_local_imports(
    client, repository, connected_repository
):
    commit = _commit(
        repository,
        {
            "one/common.py": "VALUE = 1\n",
            "two/common.py": "VALUE = 2\n",
            "consumer.py": "import common\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    unresolved = response.get_json()["data"]["unresolvedImports"]
    assert unresolved == [
        {
            "path": "consumer.py",
            "module": "common",
            "level": 0,
            "reason": "ambiguous_local_module",
            "candidates": ["one/common.py", "two/common.py"],
        }
    ]


def test_dependency_endpoint_enforces_file_byte_node_and_edge_limits(
    client, app, repository, connected_repository
):
    app.config.update(
        MAX_DEPENDENCY_FILES=20,
        MAX_DEPENDENCY_FILE_BYTES=256_000,
        MAX_DEPENDENCY_TOTAL_BYTES=256_000,
        MAX_DEPENDENCY_NODES=20,
        MAX_DEPENDENCY_EDGES=1,
    )
    commit = _commit(
        repository,
        {
            "a.py": "import b\n",
            "b.py": "import c\n",
            "c.py": "VALUE = 1\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["summary"]["truncated"] is True
    assert len(payload["graph"]["edges"]) <= 1
    assert payload["limits"]["maxEdges"] == 1


def test_dependency_endpoint_enforces_file_and_byte_limits(
    client, app, repository, connected_repository
):
    app.config.update(
        MAX_DEPENDENCY_FILES=1,
        MAX_DEPENDENCY_FILE_BYTES=8,
        MAX_DEPENDENCY_TOTAL_BYTES=8,
        MAX_DEPENDENCY_NODES=1,
    )
    commit = _commit(
        repository,
        {
            "one.py": "import two\n",
            "two.py": "VALUE = 1\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["summary"]["truncated"] is True
    assert payload["graph"]["nodes"] == []
    assert payload["limits"]["maxFiles"] == 1
    assert payload["limits"]["maxFileBytes"] == 8


def test_dependency_endpoint_omits_files_skipped_by_file_limit(
    client, app, repository, connected_repository
):
    app.config.update(
        MAX_DEPENDENCY_FILES=1,
        MAX_DEPENDENCY_FILE_BYTES=256_000,
        MAX_DEPENDENCY_TOTAL_BYTES=256_000,
        MAX_DEPENDENCY_NODES=10,
    )
    commit = _commit(
        repository,
        {
            "a.py": "VALUE = 1\n",
            "b.py": "VALUE = 2\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    nodes = response.get_json()["data"]["graph"]["nodes"]
    assert nodes == [{"path": "a.py", "module": "a", "present": True}]


def test_python_file_truncation_sets_overall_truncated_flag(
    client, app, repository, connected_repository
):
    app.config.update(MAX_DEPENDENCY_FILES=1, MAX_DEPENDENCY_NODES=10)
    commit = _commit(
        repository,
        {
            "first.py": "VALUE = 1\n",
            "second.py": "VALUE = 2\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    summary = response.get_json()["data"]["summary"]
    assert summary["filesTruncated"] is True
    assert summary["truncated"] is True


def test_tree_entry_truncation_sets_overall_truncated_flag(
    client, app, repository, connected_repository
):
    app.config["MAX_DEPENDENCY_TREE_ENTRIES"] = 1
    commit = _commit(
        repository,
        {
            "first.py": "VALUE = 1\n",
            "second.py": "VALUE = 2\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    summary = response.get_json()["data"]["summary"]
    assert summary["treeEntriesTruncated"] is True
    assert summary["truncated"] is True


def test_dependency_endpoint_enforces_node_limit(
    client, app, repository, connected_repository
):
    app.config.update(MAX_DEPENDENCY_FILES=20, MAX_DEPENDENCY_NODES=1)
    commit = _commit(
        repository,
        {
            "a.py": "import b\n",
            "b.py": "VALUE = 1\n",
        },
    )

    response = _analysis(client, connected_repository["id"], commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert len(payload["graph"]["nodes"]) <= 1
    assert payload["summary"]["truncated"] is True
    assert payload["limits"]["maxNodes"] == 1


def test_dependency_endpoint_enforces_traversal_depth(
    client, app, repository, connected_repository
):
    app.config["MAX_DEPENDENCY_DEPTH"] = 1
    _commit(
        repository,
        {
            "a.py": "import b\n",
            "b.py": "import c\n",
            "c.py": "VALUE = 1\n",
        },
    )
    changed = _commit(repository, {"c.py": "VALUE = 2\n"})

    response = _analysis(client, connected_repository["id"], changed)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["graph"]["directDependents"] == [{"path": "b.py", "depth": 1}]
    assert payload["graph"]["indirectDependents"] == []
    assert payload["summary"]["truncated"] is True
    assert payload["limits"]["maxDepth"] == 1


def test_dependency_endpoint_supports_root_commit(
    client, app
):
    root_path = app.config["TEST_APPROVED_ROOT"] / "root-dependencies"
    root_path.mkdir()
    root_repo = Repo.init(root_path)
    with root_repo.config_writer() as config:
        config.set_value("user", "name", "Test Author")
        config.set_value("user", "email", "test@example.invalid")
    (root_path / "root_module.py").write_text("VALUE = 1\n", encoding="utf-8")
    root_repo.index.add(["root_module.py"])
    root_commit = root_repo.index.commit("Initial dependency source")
    root_connected = client.post(
        "/api/repositories/connect", json={"path": str(root_path)}
    ).get_json()["data"]

    response = _analysis(client, root_connected["id"], root_commit)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["baseCommit"] is None
    assert payload["baseStrategy"] == "empty_tree"
    assert payload["changedFiles"] == ["root_module.py"]


def test_dependency_import_extraction_does_not_execute_code():
    source = "import existing\nraise RuntimeError('must not execute')\n"
    tree = ast.parse(source)

    from app.services.dependency_service import _extract_imports

    assert _extract_imports(tree) == [
        {"module": "existing", "level": 0, "names": []}
    ]

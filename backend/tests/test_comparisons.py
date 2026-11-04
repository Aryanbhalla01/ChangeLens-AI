def test_compare_commits_returns_bounded_unified_diffs(
    client, repository, connected_repository
):
    response = client.get(
        f"/api/repositories/{connected_repository['id']}/compare"
        f"?base={repository['first'].hexsha}&target={repository['second'].hexsha}"
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["baseCommit"]["hash"] == repository["first"].hexsha
    assert payload["targetCommit"]["hash"] == repository["second"].hexsha
    assert {item["path"] for item in payload["files"]} == {"README.md", "added.txt"}
    changed = next(item for item in payload["files"] if item["path"] == "README.md")
    assert changed["changeType"] == "modified"
    assert changed["additions"] == 1
    assert changed["deletions"] == 0
    assert "+second line" in changed["diff"]


def test_compare_rejects_invalid_hash(client, connected_repository, repository):
    response = client.get(
        f"/api/repositories/{connected_repository['id']}/compare"
        f"?base={repository['first'].hexsha}&target=--all"
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_COMMIT_HASH"


def test_compare_missing_parameters_returns_consistent_error(client, connected_repository):
    response = client.get(f"/api/repositories/{connected_repository['id']}/compare")

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REQUEST"


def test_binary_file_is_reported_without_diff_text(
    client, repository, connected_repository
):
    binary_path = repository["path"] / "binary.dat"
    binary_path.write_bytes(b"\x00\x01\x02")
    repository["repo"].index.add(["binary.dat"])
    commit = repository["repo"].index.commit("Add binary file")

    response = client.get(
        f"/api/repositories/{connected_repository['id']}/compare"
        f"?base={repository['third'].hexsha}&target={commit.hexsha}"
    )

    assert response.status_code == 200
    item = response.get_json()["data"]["files"][0]
    assert item["binary"] is True
    assert item["diff"] == ""


def test_large_blob_is_marked_truncated(client, app, repository, connected_repository):
    app.config["MAX_BLOB_READ_BYTES"] = 16
    large_path = repository["path"] / "large.txt"
    large_path.write_text("a" * 100, encoding="utf-8")
    repository["repo"].index.add(["large.txt"])
    commit = repository["repo"].index.commit("Add large file")

    response = client.get(
        f"/api/repositories/{connected_repository['id']}/compare"
        f"?base={repository['third'].hexsha}&target={commit.hexsha}"
    )

    assert response.status_code == 200
    item = response.get_json()["data"]["files"][0]
    assert item["truncated"] is True
    assert item["diff"] == ""

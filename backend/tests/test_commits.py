def test_commit_history_returns_real_paginated_commits(
    client, repository, connected_repository
):
    response = client.get(
        f"/api/repositories/{connected_repository['id']}/commits?page=1&per_page=2"
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["pagination"] == {
        "page": 1,
        "perPage": 2,
        "total": 3,
        "hasMore": True,
        "truncated": False,
    }
    assert [item["hash"] for item in payload["items"]] == [
        repository["third"].hexsha,
        repository["second"].hexsha,
    ]
    assert payload["items"][0]["author"] == "Test Author"
    assert payload["items"][0]["changedFileCount"] == 1


def test_commit_history_supports_message_and_branch_filters(
    client, connected_repository, repository
):
    branch = repository["repo"].active_branch.name
    response = client.get(
        f"/api/repositories/{connected_repository['id']}/commits?search=INITIAL&branch={branch}"
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert len(payload["items"]) == 1
    assert payload["items"][0]["message"] == "Initial commit"


def test_commit_detail_includes_changes(client, repository, connected_repository):
    response = client.get(
        f"/api/repositories/{connected_repository['id']}/commits/{repository['second'].hexsha}"
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert len(payload["parents"]) == 1
    assert {item["path"] for item in payload["addedFiles"]} == {"added.txt"}
    assert {item["path"] for item in payload["modifiedFiles"]} == {"README.md"}


def test_invalid_commit_hash_is_rejected(client, connected_repository):
    response = client.get(
        f"/api/repositories/{connected_repository['id']}/commits/not-a-revision"
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_COMMIT_HASH"


def test_empty_repository_history_is_a_structured_error(client, app):
    from git import Repo

    path = app.config["TEST_APPROVED_ROOT"] / "empty-history"
    path.mkdir()
    Repo.init(path)
    connected = client.post("/api/repositories/connect", json={"path": str(path)}).get_json()[
        "data"
    ]

    response = client.get(f"/api/repositories/{connected['id']}/commits")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "EMPTY_REPOSITORY"


def test_initial_commit_details_have_no_parent(client, repository, connected_repository):
    response = client.get(
        f"/api/repositories/{connected_repository['id']}/commits/{repository['first'].hexsha}"
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["parents"] == []
    assert {item["path"] for item in payload["addedFiles"]} == {"README.md"}

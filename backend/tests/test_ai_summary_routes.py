def _summary_url(repository_id, commit_hash):
    return (
        f"/api/repositories/{repository_id}/commits/{commit_hash}/summary"
    )


def test_summary_route_returns_local_insights(
    client, repository, connected_repository
):
    response = client.get(
        _summary_url(connected_repository["id"], repository["second"].hexsha)
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["data"]["available"] is True
    assert payload["data"]["label"] == "Local, rule-based insights"
    assert payload["data"]["commitMessage"] == "Add a line and file"
    assert payload["data"]["author"] == "Test Author"


def test_summary_route_returns_successful_mocked_summary(
    client, repository, connected_repository, monkeypatch
):
    expected = {
        "available": True,
        "summary": "What changed: A change.\nWhy it matters: It matters.",
        "whatChanged": "A change.",
        "whyItMatters": "It matters.",
        "importantFiles": ["README.md"],
        "suggestedReviewChecks": ["Check behavior."],
    }
    monkeypatch.setattr(
        "app.routes.commits.summarize_commit",
        lambda repository_id, commit_hash: expected,
    )

    response = client.get(
        _summary_url(connected_repository["id"], repository["second"].hexsha)
    )

    assert response.status_code == 200
    assert response.get_json() == {"success": True, "data": expected}


def test_summary_route_preserves_invalid_repository_and_commit_errors(
    client, repository, connected_repository
):
    missing_repository = client.get(
        _summary_url("missing-repository", repository["second"].hexsha)
    )
    invalid_commit = client.get(
        _summary_url(connected_repository["id"], "not-a-revision")
    )

    assert missing_repository.status_code == 404
    assert missing_repository.get_json()["error"]["code"] == "REPOSITORY_NOT_FOUND"
    assert invalid_commit.status_code == 400
    assert invalid_commit.get_json()["error"]["code"] == "INVALID_COMMIT_HASH"

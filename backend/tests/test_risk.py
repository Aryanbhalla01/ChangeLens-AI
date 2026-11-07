from app.services.risk_service import _classify_score


def _risk(client, repository_id, commit_hash):
    return client.get(
        f"/api/repositories/{repository_id}/commits/{commit_hash}/risk"
    )


def _commit(repository, message, writes):
    for relative_path, content in writes.items():
        path = repository["path"] / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        repository["repo"].index.add([relative_path])
    return repository["repo"].index.commit(message)


def test_risk_reports_bounded_explainable_factors(
    client, repository, connected_repository
):
    commit = _commit(
        repository,
        "Add sensitive paths and static findings",
        {
            "auth/login.py": (
                "result = eval(value)\n"
                'password = "example-placeholder"\n'
            ),
            "secrets/.env": 'API_KEY = "local-placeholder"\n',
        },
    )

    response = _risk(client, connected_repository["id"], commit.hexsha)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    factors = {factor["name"]: factor for factor in payload["factors"]}
    assert factors["changedFiles"]["score"] == 10
    assert factors["changedLines"]["additions"] == 3
    assert factors["changedLines"]["deletions"] == 0
    assert factors["changedLines"]["score"] == 1
    assert factors["sensitivePaths"]["score"] == 20
    assert factors["staticFindings"]["severityCounts"] == {"warning": 2}
    assert factors["staticFindings"]["score"] == 10
    assert payload["score"] == sum(factor["score"] for factor in factors.values())
    assert payload["classification"] == "moderate"
    assert payload["heuristic"] is True
    assert "NOT a probability of bugs" in payload["disclaimer"]
    assert all(factor["explanation"] for factor in payload["factors"])
    assert payload["limits"]["maxFiles"] > 0


def test_risk_classification_boundaries():
    assert [_classify_score(score) for score in (0, 24, 25, 49, 50, 74, 75, 100)] == [
        "low",
        "low",
        "moderate",
        "moderate",
        "high",
        "high",
        "critical",
        "critical",
    ]


def test_risk_for_empty_change_commit_is_zero(
    client, repository, connected_repository
):
    repository["repo"].git.commit("--allow-empty", "-m", "No changes")
    commit = repository["repo"].head.commit

    response = _risk(client, connected_repository["id"], commit.hexsha)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["score"] == 0
    assert payload["classification"] == "low"
    assert all(factor["score"] == 0 for factor in payload["factors"])


def test_risk_rejects_invalid_commit_hash(client, connected_repository):
    response = _risk(client, connected_repository["id"], "not-a-revision")

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_COMMIT_HASH"


def test_risk_returns_not_found_for_unknown_commit(client, connected_repository):
    response = _risk(client, connected_repository["id"], "f" * 40)

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "INVALID_COMMIT_HASH"


def test_risk_returns_not_found_for_unregistered_repository(client, repository):
    response = _risk(client, "missing-repository", repository["third"].hexsha)

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "REPOSITORY_NOT_FOUND"

import pytest
from git import Repo

from app.models import RepositoryRegistration
from app.utils.errors import ApiError
from app.services.public_repository_service import validate_public_repository_url


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://github.com/octo-org/sample_repo", ("octo-org", "sample_repo")),
        ("https://github.com/a/r", ("a", "r")),
    ],
)
def test_accepts_canonical_public_github_urls(url, expected):
    assert validate_public_repository_url(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "http://github.com/octo-org/sample",
        "https://github.com.evil.example/octo-org/sample",
        "https://user@github.com/octo-org/sample",
        "https://github.com:443/octo-org/sample",
        "https://github.com/octo-org/sample/",
        "https://github.com/octo-org/sample.git",
        "https://github.com/octo-org/sample/tree/main",
        "https://github.com/octo-org/sample?tab=readme",
        "https://github.com/octo-org/sample#readme",
        "https://github.com/octo%2dorg/sample",
        " https://github.com/octo-org/sample",
    ],
)
def test_rejects_noncanonical_github_urls(url):
    with pytest.raises(ApiError) as error:
        validate_public_repository_url(url)

    assert error.value.code == "INVALID_GITHUB_REPOSITORY_URL"
    assert error.value.status_code == 400


def test_public_repository_connection_reuses_registration_and_supports_analysis(
    app, client, repository
):
    (repository["path"] / "check.py").write_text(
        "result = eval(user_input)\n", encoding="utf-8"
    )
    repository["repo"].index.add(["check.py"])
    commit = repository["repo"].index.commit("Add dynamic Python execution")
    repository["repo"].create_head("feature", commit)

    clone_calls = []

    def clone_from_local_source(url, destination):
        clone_calls.append(url)
        Repo.clone_from(str(repository["path"]), str(destination))

    app.config["PUBLIC_REPOSITORY_SIZE_PROVIDER"] = lambda _owner, _name: 1024
    app.config["PUBLIC_REPOSITORY_CLONER"] = clone_from_local_source
    url = "https://github.com/octo-org/sample-repo"

    response = client.post("/api/repositories/connect", json={"url": url})

    assert response.status_code == 201
    connected = response.get_json()["data"]
    assert connected["name"] == "octo-org/sample-repo"
    assert connected["path"].startswith(
        str(app.config["MANAGED_REPOSITORY_ROOT"].resolve())
    )
    assert connected["latestCommit"]["hash"] == commit.hexsha

    history = client.get(
        f"/api/repositories/{connected['id']}/commits?page=1&per_page=10"
    )
    feature_history = client.get(
        f"/api/repositories/{connected['id']}/commits?page=1&per_page=10&branch=feature"
    )
    analysis = client.get(
        f"/api/repositories/{connected['id']}/commits/{commit.hexsha}/analysis"
    )
    assert history.status_code == 200
    assert history.get_json()["data"]["pagination"]["total"] == 4
    assert feature_history.status_code == 200
    assert feature_history.get_json()["data"]["pagination"]["total"] == 4
    assert analysis.status_code == 200
    assert analysis.get_json()["data"]["findings"][0]["ruleId"] == "PY001"

    duplicate = client.post("/api/repositories/connect", json={"url": url})
    assert duplicate.status_code == 201
    assert duplicate.get_json()["data"]["id"] == connected["id"]
    assert clone_calls == [url]
    with app.app_context():
        assert RepositoryRegistration.query.count() == 1


def test_rejects_public_repository_above_configured_size_before_cloning(
    app, client
):
    app.config["MAX_PUBLIC_REPOSITORY_SIZE_BYTES"] = 1024
    app.config["PUBLIC_REPOSITORY_SIZE_PROVIDER"] = lambda _owner, _name: 1025
    app.config["PUBLIC_REPOSITORY_CLONER"] = lambda *_args: pytest.fail(
        "Oversized repository must not be cloned"
    )

    response = client.post(
        "/api/repositories/connect",
        json={"url": "https://github.com/octo-org/too-large"},
    )

    assert response.status_code == 413
    assert response.get_json()["error"]["code"] == "PUBLIC_REPOSITORY_TOO_LARGE"
    with app.app_context():
        assert RepositoryRegistration.query.count() == 0


def test_invalid_public_url_does_not_call_github_provider(app, client):
    app.config["PUBLIC_REPOSITORY_SIZE_PROVIDER"] = lambda *_args: pytest.fail(
        "Invalid URLs must be rejected before external metadata access"
    )

    response = client.post(
        "/api/repositories/connect",
        json={"url": "https://github.com/octo-org/repo?redirect=example"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_GITHUB_REPOSITORY_URL"


def test_failed_clone_is_cleaned_up_without_registration(app, client):
    app.config["PUBLIC_REPOSITORY_SIZE_PROVIDER"] = lambda _owner, _name: 1

    def fail_clone(_url, _destination):
        raise OSError("clone failed")

    app.config["PUBLIC_REPOSITORY_CLONER"] = fail_clone
    response = client.post(
        "/api/repositories/connect",
        json={"url": "https://github.com/octo-org/clone-fails"},
    )

    assert response.status_code == 500
    assert list(app.config["MANAGED_REPOSITORY_ROOT"].glob("*")) == []
    with app.app_context():
        assert RepositoryRegistration.query.count() == 0

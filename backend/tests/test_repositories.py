import os

import pytest

from app import create_app
from app.models import RepositoryRegistration
from app.utils import validators


def test_connect_and_read_repository(client, repository, connected_repository):
    assert connected_repository["name"] == "sample-repo"
    assert connected_repository["path"] == str(repository["path"])
    assert connected_repository["branch"] in ("master", "main")
    assert connected_repository["commitCount"] == 3
    assert connected_repository["latestCommit"]["hash"] == repository["third"].hexsha

    listing = client.get("/api/repositories")
    status = client.get(f"/api/repositories/{connected_repository['id']}/status")
    detail = client.get(f"/api/repositories/{connected_repository['id']}")

    assert listing.status_code == 200
    assert listing.get_json()["data"][0]["id"] == connected_repository["id"]
    assert detail.get_json()["data"]["path"] == str(repository["path"])
    assert status.get_json()["data"]["commitCount"] == 3
    assert status.get_json()["data"]["isDirty"] is False


def test_rejects_non_repository_directory(client, app):
    non_repository = app.config["TEST_APPROVED_ROOT"] / "not-a-repository"
    non_repository.mkdir()

    response = client.post("/api/repositories/connect", json={"path": str(non_repository)})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REPOSITORY"
    with app.app_context():
        assert RepositoryRegistration.query.count() == 0


def test_rejects_path_outside_approved_root(client, app, tmp_path):
    outside = tmp_path / "outside-repository"
    outside.mkdir()

    response = client.post("/api/repositories/connect", json={"path": str(outside)})

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


def test_rejects_path_traversal(client, app, tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    traversal = app.config["TEST_APPROVED_ROOT"] / ".." / "outside"

    response = client.post("/api/repositories/connect", json={"path": str(traversal)})

    assert response.status_code == 403


def test_registration_persists_across_app_instances(repository, tmp_path):
    database_path = (tmp_path / "persistent.sqlite3").as_posix()
    config = {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{database_path}",
        "ALLOWED_REPOSITORY_ROOTS": [str(repository["path"].parent)],
        "CORS_ORIGINS": [],
    }

    first_app = create_app(config)
    with first_app.test_client() as first_client:
        connected = first_client.post(
            "/api/repositories/connect", json={"path": str(repository["path"])}
        ).get_json()["data"]

    second_app = create_app(config)
    with second_app.test_client() as second_client:
        listing = second_client.get("/api/repositories").get_json()["data"]

    assert any(item["id"] == connected["id"] for item in listing)


def test_registered_repository_is_revalidated_after_allowlist_changes(
    app, client, connected_repository
):
    app.config["ALLOWED_REPOSITORY_ROOTS"] = []

    detail = client.get(f"/api/repositories/{connected_repository['id']}")
    status = client.get(f"/api/repositories/{connected_repository['id']}/status")
    listing = client.get("/api/repositories")

    assert detail.status_code == 403
    assert status.status_code == 403
    assert listing.status_code == 200
    assert listing.get_json()["data"] == []


def test_empty_repository_connection(client, app):
    path = app.config["TEST_APPROVED_ROOT"] / "empty"
    path.mkdir()
    from git import Repo

    Repo.init(path)
    response = client.post("/api/repositories/connect", json={"path": str(path)})

    assert response.status_code == 201
    assert response.get_json()["data"]["latestCommit"] is None
    assert response.get_json()["data"]["commitCount"] == 0


def test_allows_internal_git_pointer_file(client, app, repository):
    worktree = app.config["TEST_APPROVED_ROOT"] / "linked-worktree"
    repository["repo"].git.worktree(
        "add", "-b", "security-test-worktree", str(worktree)
    )
    assert (worktree / ".git").is_file()

    response = client.post("/api/repositories/connect", json={"path": str(worktree)})

    assert response.status_code == 201
    assert response.get_json()["data"]["path"] == str(worktree.resolve())


def test_rejects_git_data_directory_outside_allowlist(client, app, tmp_path, monkeypatch):
    from git import Repo

    external_git_dir = tmp_path / "external.git"
    Repo.init(external_git_dir, bare=True)
    worktree = app.config["TEST_APPROVED_ROOT"] / "linked-worktree"
    worktree.mkdir()
    (worktree / ".git").write_text(f"gitdir: {external_git_dir.as_posix()}\n", encoding="utf-8")

    repo_opened = False

    def unexpected_repo_open(*_args, **_kwargs):
        nonlocal repo_opened
        repo_opened = True
        raise AssertionError("GitPython Repo must not open external metadata")

    monkeypatch.setattr(validators, "Repo", unexpected_repo_open)
    response = client.post("/api/repositories/connect", json={"path": str(worktree)})

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"
    assert repo_opened is False


def test_rejects_relative_external_git_pointer_before_opening(client, app, tmp_path, monkeypatch):
    external_git_dir = tmp_path / "external.git"
    from git import Repo

    Repo.init(external_git_dir, bare=True)
    worktree = app.config["TEST_APPROVED_ROOT"] / "relative-link"
    worktree.mkdir()
    relative_target = os.path.relpath(external_git_dir, worktree)
    (worktree / ".git").write_text(f"gitdir: {relative_target}\n", encoding="utf-8")
    monkeypatch.setattr(
        validators,
        "Repo",
        lambda *_args, **_kwargs: pytest.fail("GitPython opened an external gitdir"),
    )

    response = client.post("/api/repositories/connect", json={"path": str(worktree)})

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


@pytest.mark.parametrize(
    "pointer_contents",
    [
        "not a gitdir pointer\n",
        "x" * 4097,
    ],
)
def test_rejects_malformed_or_oversized_git_pointer(
    client, app, pointer_contents
):
    worktree = app.config["TEST_APPROVED_ROOT"] / "invalid-git-pointer"
    worktree.mkdir()
    (worktree / ".git").write_text(pointer_contents, encoding="utf-8")

    response = client.post("/api/repositories/connect", json={"path": str(worktree)})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REPOSITORY"


def test_rejects_external_common_directory_before_opening(
    client, repository, tmp_path, monkeypatch
):
    from git import Repo

    external_common_dir = tmp_path / "external-common"
    Repo.init(external_common_dir, bare=True)
    git_dir = repository["path"] / ".git"
    (git_dir / "commondir").write_text(
        f"{external_common_dir.as_posix()}\n", encoding="utf-8"
    )
    monkeypatch.setattr(
        validators,
        "Repo",
        lambda *_args, **_kwargs: pytest.fail("GitPython opened an external common dir"),
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


def test_rejects_symlinked_commondir_metadata(client, repository, tmp_path, monkeypatch):
    external_commondir = tmp_path / "external-commondir"
    external_commondir.write_text("external\n", encoding="utf-8")
    commondir = repository["path"] / ".git" / "commondir"
    try:
        commondir.symlink_to(external_commondir)
    except (NotImplementedError, OSError) as error:
        pytest.skip(f"File symlinks are unavailable: {error}")
    monkeypatch.setattr(
        validators,
        "Repo",
        lambda *_args, **_kwargs: pytest.fail("GitPython opened external commondir metadata"),
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


def test_rejects_external_object_alternate_before_opening(
    client, repository, tmp_path, monkeypatch
):
    external_objects = tmp_path / "external-objects"
    (external_objects / "info").mkdir(parents=True)
    alternates = repository["path"] / ".git" / "objects" / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    alternates.write_text(f"{external_objects.as_posix()}\n", encoding="utf-8")
    monkeypatch.setattr(
        validators,
        "Repo",
        lambda *_args, **_kwargs: pytest.fail("GitPython opened an external object alternate"),
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


def test_rejects_symlinked_alternates_metadata(client, repository, tmp_path, monkeypatch):
    external_alternates = tmp_path / "external-alternates"
    external_alternates.write_text("", encoding="utf-8")
    alternates = repository["path"] / ".git" / "objects" / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    try:
        alternates.symlink_to(external_alternates)
    except (NotImplementedError, OSError) as error:
        pytest.skip(f"File symlinks are unavailable: {error}")
    monkeypatch.setattr(
        validators,
        "Repo",
        lambda *_args, **_kwargs: pytest.fail("GitPython opened external alternates metadata"),
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


def test_rejects_symlinked_object_directory(client, repository, tmp_path, monkeypatch):
    external_objects = tmp_path / "external-object-dir"
    (external_objects / "info").mkdir(parents=True)
    object_dir = repository["path"] / ".git" / "objects"
    original_objects = repository["path"] / ".git" / "objects-approved"
    object_dir.rename(original_objects)
    try:
        object_dir.symlink_to(external_objects, target_is_directory=True)
    except (NotImplementedError, OSError) as error:
        original_objects.rename(object_dir)
        pytest.skip(f"Directory symlinks are unavailable: {error}")
    monkeypatch.setattr(
        validators,
        "Repo",
        lambda *_args, **_kwargs: pytest.fail("GitPython opened external object storage"),
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


@pytest.mark.parametrize(
    "contents",
    [
        pytest.param(b"\xff\n", id="malformed-utf8"),
        pytest.param(b"x" * (64 * 1024 + 1), id="oversized"),
    ],
)
def test_rejects_malformed_or_oversized_alternates_file(
    client, repository, contents
):
    alternates = repository["path"] / ".git" / "objects" / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    alternates.write_bytes(contents)

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REPOSITORY"


def test_rejects_relative_external_object_alternate(client, repository, tmp_path):
    external_objects = tmp_path / "relative-external-objects"
    (external_objects / "info").mkdir(parents=True)
    object_dir = repository["path"] / ".git" / "objects"
    alternates = object_dir / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    relative_alternate = os.path.relpath(external_objects, object_dir)
    alternates.write_text(f"{relative_alternate}\n", encoding="utf-8")

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


def test_rejects_alternate_directory_cycle_inside_approved_root(client, repository, app):
    object_dir = repository["path"] / ".git" / "objects"
    first_alternate = app.config["TEST_APPROVED_ROOT"] / "alternate-cycle-a"
    second_alternate = app.config["TEST_APPROVED_ROOT"] / "alternate-cycle-b"
    for path in (first_alternate, second_alternate):
        (path / "info").mkdir(parents=True)
    (first_alternate / "info" / "alternates").write_text(
        f"{second_alternate.as_posix()}\n", encoding="utf-8"
    )
    (second_alternate / "info" / "alternates").write_text(
        f"{first_alternate.as_posix()}\n", encoding="utf-8"
    )
    (object_dir / "info" / "alternates").write_text(
        f"{first_alternate.as_posix()}\n", encoding="utf-8"
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REPOSITORY"


def test_rejects_more_than_256_alternate_object_directories(
    client, repository, app
):
    first = app.config["TEST_APPROVED_ROOT"] / "alternate-0"
    current = first
    for index in range(256):
        (current / "info").mkdir(parents=True)
        next_path = app.config["TEST_APPROVED_ROOT"] / f"alternate-{index + 1}"
        (current / "info" / "alternates").write_text(
            f"{next_path.as_posix()}\n", encoding="utf-8"
        )
        current = next_path
    (current / "info").mkdir(parents=True)
    (repository["path"] / ".git" / "objects" / "info" / "alternates").write_text(
        f"{first.as_posix()}\n", encoding="utf-8"
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REPOSITORY"


def test_allows_object_alternate_inside_approved_root(client, repository, app):
    internal_objects = app.config["TEST_APPROVED_ROOT"] / "approved-alternate"
    (internal_objects / "info").mkdir(parents=True)
    alternates = repository["path"] / ".git" / "objects" / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    alternates.write_text(f"{internal_objects.as_posix()}\n", encoding="utf-8")

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 201
    assert response.get_json()["success"] is True


def test_rejects_recursive_external_object_alternate(
    client, repository, app, tmp_path, monkeypatch
):
    internal_objects = app.config["TEST_APPROVED_ROOT"] / "alternate-objects"
    (internal_objects / "info").mkdir(parents=True)
    external_objects = tmp_path / "nested-external-objects"
    (external_objects / "info").mkdir(parents=True)
    (internal_objects / "info" / "alternates").write_text(
        f"{external_objects.as_posix()}\n", encoding="utf-8"
    )
    alternates = repository["path"] / ".git" / "objects" / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    alternates.write_text(f"{internal_objects.as_posix()}\n", encoding="utf-8")
    monkeypatch.setattr(
        validators,
        "Repo",
        lambda *_args, **_kwargs: pytest.fail("GitPython opened a nested external alternate"),
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


@pytest.mark.parametrize(
    "variable",
    [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_INDEX_FILE",
        "GIT_CEILING_DIRECTORIES",
        "GIT_DISCOVERY_ACROSS_FILESYSTEM",
        "GIT_CONFIG_COUNT",
        "GIT_CONFIG_KEY_0",
        "GIT_CONFIG_KEY_custom",
        "GIT_CONFIG_VALUE_0",
        "GIT_CONFIG_VALUE_custom",
        "GIT_CONFIG_PARAMETERS",
        "GIT_CONFIG_SYSTEM",
        "GIT_CONFIG_GLOBAL",
        "GIT_SHALLOW_FILE",
        "GIT_GRAFT_FILE",
    ],
)
def test_rejects_git_environment_redirection(
    client, repository, monkeypatch, variable, tmp_path
):
    monkeypatch.setenv(variable, str(tmp_path / "redirected"))

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "GIT_ENVIRONMENT_NOT_ALLOWED"


def test_empty_git_override_variables_are_ignored(client, repository, monkeypatch):
    monkeypatch.setenv("GIT_CONFIG_COUNT", "")
    monkeypatch.setenv("GIT_CONFIG_KEY_0", "")
    monkeypatch.setenv("GIT_CONFIG_VALUE_0", "")
    monkeypatch.setenv("GIT_SHALLOW_FILE", "")
    monkeypatch.setenv("GIT_GRAFT_FILE", "")

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 201


def test_rejects_symlinked_git_directory_outside_allowed_root(
    client, repository, tmp_path, monkeypatch
):
    external_git_dir = tmp_path / "external-gitdir"
    from git import Repo

    Repo.init(external_git_dir, bare=True)
    git_dir = repository["path"] / ".git"
    original_git_dir = repository["path"] / ".git-approved"
    git_dir.rename(original_git_dir)
    try:
        git_dir.symlink_to(external_git_dir, target_is_directory=True)
    except (NotImplementedError, OSError) as error:
        original_git_dir.rename(git_dir)
        pytest.skip(f"Directory symlinks are unavailable: {error}")
    monkeypatch.setattr(
        validators,
        "Repo",
        lambda *_args, **_kwargs: pytest.fail("GitPython opened a symlinked external gitdir"),
    )

    response = client.post(
        "/api/repositories/connect", json={"path": str(repository["path"])}
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"


def test_rejects_symlinked_repository_outside_allowed_root(client, app, tmp_path):
    from git import Repo

    outside_repository = tmp_path / "outside-repository"
    Repo.init(outside_repository)
    alias = app.config["TEST_APPROVED_ROOT"] / "outside-alias"
    try:
        alias.symlink_to(outside_repository, target_is_directory=True)
    except (NotImplementedError, OSError) as error:
        pytest.skip(f"Directory symlinks are unavailable: {error}")

    response = client.post("/api/repositories/connect", json={"path": str(alias)})

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "REPOSITORY_PATH_NOT_ALLOWED"

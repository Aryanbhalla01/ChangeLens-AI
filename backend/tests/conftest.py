"""Temporary Git repositories and an isolated Flask test application."""

import os
from pathlib import Path

import pytest
from git import Repo

from app import create_app
from app.models import db


@pytest.fixture
def app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    allowed_root = tmp_path / "approved"
    allowed_root.mkdir()
    isolated_home = tmp_path / "git-home"
    isolated_home.mkdir()
    for name in (
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_INDEX_FILE",
        "GIT_CEILING_DIRECTORIES",
        "GIT_DISCOVERY_ACROSS_FILESYSTEM",
        "GIT_CONFIG_COUNT",
        "GIT_CONFIG_PARAMETERS",
        "GIT_CONFIG_SYSTEM",
        "GIT_CONFIG_GLOBAL",
        "GIT_SHALLOW_FILE",
        "GIT_GRAFT_FILE",
    ):
        monkeypatch.delenv(name, raising=False)
    for name in list(os.environ):
        if name.startswith(("GIT_CONFIG_KEY_", "GIT_CONFIG_VALUE_")):
            monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("HOME", str(isolated_home))
    monkeypatch.setenv("USERPROFILE", str(isolated_home))
    monkeypatch.setenv("APPDATA", str(isolated_home / "AppData" / "Roaming"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(isolated_home / ".config"))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    application = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite://",
            "ALLOWED_REPOSITORY_ROOTS": [str(allowed_root)],
            "CORS_ORIGINS": [],
        }
    )
    application.config["TEST_APPROVED_ROOT"] = allowed_root
    with application.app_context():
        db.drop_all()
        db.create_all()
    yield application
    with application.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def repository(app):
    path = app.config["TEST_APPROVED_ROOT"] / "sample-repo"
    path.mkdir()
    repo = Repo.init(path)
    with repo.config_writer() as config:
        config.set_value("user", "name", "Test Author")
        config.set_value("user", "email", "test@example.invalid")

    readme = path / "README.md"
    readme.write_text("first line\n", encoding="utf-8")
    repo.index.add(["README.md"])
    first = repo.index.commit("Initial commit")

    readme.write_text("first line\nsecond line\n", encoding="utf-8")
    (path / "added.txt").write_text("new file\n", encoding="utf-8")
    repo.index.add(["README.md", "added.txt"])
    second = repo.index.commit("Add a line and file")

    (path / "added.txt").unlink()
    repo.index.remove(["added.txt"])
    third = repo.index.commit("Remove added file")
    return {"path": path, "repo": repo, "first": first, "second": second, "third": third}


@pytest.fixture
def connected_repository(client, repository):
    response = client.post("/api/repositories/connect", json={"path": str(repository["path"])})
    assert response.status_code == 201
    return response.get_json()["data"]

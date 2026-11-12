"""Environment-backed application configuration."""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import make_url

load_dotenv()

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _allowed_roots() -> list[str]:
    configured = os.getenv("CHANGELENS_ALLOWED_REPO_ROOTS", "")
    return [entry.strip() for entry in configured.split(os.pathsep) if entry.strip()]


def _positive_int(name: str, default: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


def resolve_database_uri(database_uri: str) -> str:
    """Resolve filesystem-backed SQLite paths relative to the backend directory."""
    url = make_url(database_uri)
    if url.get_backend_name() != "sqlite" or not url.database:
        return database_uri

    database = url.database
    if (
        database == ":memory:"
        or database.startswith("file::memory:")
        or url.query.get("mode") == "memory"
    ):
        return database_uri

    is_sqlite_uri = database.startswith("file:")
    if is_sqlite_uri:
        database = database[len("file:") :]

    path = Path(database).expanduser()
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    resolved_database = str(path.resolve())
    if is_sqlite_uri:
        resolved_database = f"file:{resolved_database}"
    return url.set(database=resolved_database).render_as_string(hide_password=False)


class Config:
    APP_NAME = "ChangeLens AI"
    VERSION = "0.1.0"
    SECRET_KEY = os.getenv("CHANGELENS_SECRET_KEY", "local-development-only")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "CHANGELENS_DATABASE_URL",
        f"sqlite:///{(BACKEND_ROOT / 'app' / 'instance' / 'changelens.sqlite3').as_posix()}",
    )
    ALLOWED_REPOSITORY_ROOTS = _allowed_roots()
    MANAGED_REPOSITORY_ROOT = Path(
        os.getenv(
            "CHANGELENS_MANAGED_REPO_ROOT",
            str(BACKEND_ROOT / "app" / "instance" / "repositories"),
        )
    ).expanduser()
    MAX_PUBLIC_REPOSITORY_SIZE_BYTES = (
        _positive_int("CHANGELENS_MAX_PUBLIC_REPOSITORY_SIZE_MB", 100) * 1024 * 1024
    )
    MAX_PUBLIC_REPOSITORY_CHECKOUT_BYTES = MAX_PUBLIC_REPOSITORY_SIZE_BYTES * 2
    PUBLIC_REPOSITORY_CLONE_TIMEOUT_SECONDS = _positive_int(
        "CHANGELENS_PUBLIC_REPOSITORY_CLONE_TIMEOUT_SECONDS", 120
    )
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CHANGELENS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ]
    MAX_CONTENT_LENGTH = 16 * 1024
    MAX_PAGE_SIZE = 100
    MAX_HISTORY_SCAN = 10_000
    MAX_COMMIT_FILES = 200
    MAX_COMPARE_FILES = 100
    MAX_DIFF_RESPONSE_BYTES = 256_000
    MAX_FILE_DIFF_BYTES = 32_000
    MAX_BLOB_READ_BYTES = 128_000
    MAX_DIFF_LINES = 4_000
    MAX_ANALYSIS_CHANGED_LINES = 2_000
    MAX_ANALYSIS_FINDINGS = 200
    MAX_DEPENDENCY_TREE_ENTRIES = 20_000
    MAX_DEPENDENCY_FILES = 500
    MAX_DEPENDENCY_FILE_BYTES = 256_000
    MAX_DEPENDENCY_TOTAL_BYTES = 16_000_000
    MAX_DEPENDENCY_NODES = 500
    MAX_DEPENDENCY_EDGES = 2_000
    MAX_DEPENDENCY_IMPORTS = 2_000
    MAX_DEPENDENCY_DEPTH = 8
    MAX_DEPENDENCY_RESULTS = 200

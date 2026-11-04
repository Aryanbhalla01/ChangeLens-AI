"""Validation for repository paths and Git commit identifiers."""

import os
import re
from pathlib import Path

from git import InvalidGitRepositoryError, NoSuchPathError, Repo

from .errors import ApiError

_COMMIT_HASH = re.compile(r"^[0-9a-fA-F]{4,64}$")
_MAX_ALTERNATE_OBJECT_DIRS = 256
_MAX_ALTERNATES_FILE_BYTES = 64 * 1024
_MAX_GIT_POINTER_BYTES = 4 * 1024
_GIT_CONFIG_REDIRECT_ENV = (
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_SYSTEM",
    "GIT_CONFIG_GLOBAL",
)
_GIT_REDIRECT_ENV = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_INDEX_FILE",
    "GIT_CEILING_DIRECTORIES",
    "GIT_DISCOVERY_ACROSS_FILESYSTEM",
    "GIT_SHALLOW_FILE",
    "GIT_GRAFT_FILE",
)


def validate_repository_path(path: str, allowed_roots: list[str]) -> tuple[Path, Repo]:
    """Resolve and open a working-tree repository below a configured allowed root."""
    if not path or "\x00" in path:
        raise ApiError("INVALID_REPOSITORY_PATH", "The repository path is invalid.", 400)
    try:
        candidate = Path(path).expanduser().resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as error:
        raise ApiError("INVALID_REPOSITORY_PATH", "The repository path is unavailable.", 400) from error
    if not candidate.is_dir():
        raise ApiError("INVALID_REPOSITORY_PATH", "The repository path must be a directory.", 400)

    roots: list[Path] = []
    for configured_root in allowed_roots:
        try:
            roots.append(Path(configured_root).expanduser().resolve(strict=True))
        except (OSError, RuntimeError, ValueError):
            continue
    if not any(_is_within(candidate, root) for root in roots):
        raise ApiError(
            "REPOSITORY_PATH_NOT_ALLOWED",
            "The repository path is outside the configured allowed directories.",
            403,
        )

    _reject_git_environment_redirects()
    git_dir, common_dir = _validate_git_metadata(candidate, roots)

    try:
        repository = Repo(str(candidate), search_parent_directories=False)
    except (InvalidGitRepositoryError, NoSuchPathError, OSError) as error:
        raise ApiError(
            "INVALID_REPOSITORY",
            "The selected directory is not a valid Git repository.",
            400,
        ) from error
    try:
        opened_git_dir = Path(repository.git_dir).resolve(strict=True)
        opened_common_dir = Path(repository.common_dir).resolve(strict=True)
        verified_git_dir, verified_common_dir = _validate_git_metadata(candidate, roots)
    except (OSError, RuntimeError, ValueError) as error:
        raise ApiError("INVALID_REPOSITORY", "Git repository metadata is unavailable.", 400) from error
    if (
        opened_git_dir != git_dir
        or opened_common_dir != common_dir
        or verified_git_dir != git_dir
        or verified_common_dir != common_dir
    ):
        raise ApiError(
            "REPOSITORY_PATH_NOT_ALLOWED",
            "The repository Git metadata changed during validation.",
            403,
        )
    worktree = repository.working_tree_dir
    if worktree is None or Path(worktree).resolve() != candidate:
        raise ApiError(
            "INVALID_REPOSITORY",
            "Only Git working-tree repositories can be connected.",
            400,
        )
    return candidate, repository


def _reject_git_environment_redirects() -> None:
    has_exact_override = any(
        os.environ.get(name) for name in (*_GIT_CONFIG_REDIRECT_ENV, *_GIT_REDIRECT_ENV)
    )
    has_indexed_config = any(
        os.environ.get(name)
        for name in os.environ
        if name.startswith(("GIT_CONFIG_KEY_", "GIT_CONFIG_VALUE_"))
    )
    if has_exact_override or has_indexed_config:
        raise ApiError(
            "GIT_ENVIRONMENT_NOT_ALLOWED",
            "Git environment overrides that can alter repository access or configuration are not allowed.",
            403,
        )


def _validate_git_metadata(candidate: Path, roots: list[Path]) -> tuple[Path, Path]:
    marker = candidate / ".git"
    try:
        marker_path = marker.resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as error:
        raise ApiError(
            "INVALID_REPOSITORY",
            "The selected directory is not a valid Git repository.",
            400,
        ) from error
    if not _is_within_any(marker_path, roots):
        raise ApiError(
            "REPOSITORY_PATH_NOT_ALLOWED",
            "The repository Git metadata is outside the configured allowed directories.",
            403,
        )

    try:
        if marker_path.is_dir():
            git_dir = marker_path
        elif marker_path.is_file():
            contents = _read_bounded_text(marker_path, _MAX_GIT_POINTER_BYTES).strip()
            if not contents.startswith("gitdir:"):
                raise ValueError("Invalid .git pointer")
            git_dir_value = contents[len("gitdir:") :].strip()
            if not git_dir_value:
                raise ValueError("Empty .git pointer")
            git_dir_path = Path(git_dir_value)
            if not git_dir_path.is_absolute():
                git_dir_path = candidate / git_dir_path
            git_dir = git_dir_path.resolve(strict=True)
        else:
            raise ValueError("Invalid .git metadata")
    except (OSError, RuntimeError, UnicodeError, ValueError) as error:
        raise ApiError(
            "INVALID_REPOSITORY",
            "The selected directory is not a valid Git repository.",
            400,
        ) from error

    _require_approved_directory(git_dir, roots, "Git directory")
    common_dir = git_dir
    common_dir_file = git_dir / "commondir"
    if common_dir_file.exists() or common_dir_file.is_symlink():
        try:
            common_file_path = common_dir_file.resolve(strict=True)
            if not _is_within_any(common_file_path, roots) or not common_file_path.is_file():
                raise ApiError(
                    "REPOSITORY_PATH_NOT_ALLOWED",
                    "The common Git directory metadata is outside the configured allowed directories.",
                    403,
                )
            common_value = _read_bounded_text(
                common_file_path, _MAX_GIT_POINTER_BYTES
            ).strip()
            if not common_value:
                raise ValueError("Empty commondir pointer")
            common_path = Path(common_value)
            if not common_path.is_absolute():
                common_path = git_dir / common_path
            common_dir = common_path.resolve(strict=True)
        except ApiError:
            raise
        except (OSError, RuntimeError, UnicodeError, ValueError) as error:
            raise ApiError(
                "INVALID_REPOSITORY",
                "The common Git directory metadata is invalid.",
                400,
            ) from error
    _require_approved_directory(common_dir, roots, "Common Git directory")

    common_objects = common_dir / "objects"
    object_dirs = [common_objects]
    git_objects = git_dir / "objects"
    if git_dir != common_dir and (git_objects.exists() or git_objects.is_symlink()):
        object_dirs.append(git_objects)
    _validate_object_directories(object_dirs, roots)
    return git_dir, common_dir


def _validate_object_directories(object_dirs: list[Path], roots: list[Path]) -> None:
    pending = list(object_dirs)
    checked: set[Path] = set()
    while pending:
        try:
            canonical = pending.pop().resolve(strict=True)
        except (OSError, RuntimeError, ValueError) as error:
            raise ApiError(
                "INVALID_REPOSITORY",
                "The repository object directory is unavailable.",
                400,
            ) from error
        _require_approved_directory(canonical, roots, "Git object directory")
        if canonical in checked:
            raise ApiError(
                "INVALID_REPOSITORY",
                "The repository has cyclic or duplicate alternate object directories.",
                400,
            )
        checked.add(canonical)
        if len(checked) > _MAX_ALTERNATE_OBJECT_DIRS:
            raise ApiError(
                "INVALID_REPOSITORY",
                "The repository has too many alternate object directories.",
                400,
            )

        alternates = canonical / "info" / "alternates"
        if not alternates.exists() and not alternates.is_symlink():
            continue
        try:
            alternates_path = alternates.resolve(strict=True)
            if not _is_within_any(alternates_path, roots) or not alternates_path.is_file():
                raise ApiError(
                    "REPOSITORY_PATH_NOT_ALLOWED",
                    "Git object alternates metadata is outside the configured allowed directories.",
                    403,
                )
            with alternates_path.open("rb") as alternates_file:
                contents = alternates_file.read(_MAX_ALTERNATES_FILE_BYTES + 1)
            if len(contents) > _MAX_ALTERNATES_FILE_BYTES:
                raise ApiError(
                    "INVALID_REPOSITORY",
                    "Git object alternates metadata exceeds the allowed size.",
                    400,
                )
            entries = contents.decode("utf-8").splitlines()
        except ApiError:
            raise
        except (OSError, RuntimeError, UnicodeError, ValueError) as error:
            raise ApiError(
                "INVALID_REPOSITORY",
                "Git object alternates metadata is invalid.",
                400,
            ) from error

        for entry in entries:
            alternate_value = entry.strip()
            if not alternate_value:
                continue
            alternate = Path(alternate_value)
            if not alternate.is_absolute():
                alternate = canonical / alternate
            pending.append(alternate)


def _require_approved_directory(path: Path, roots: list[Path], label: str) -> None:
    if not _is_within_any(path, roots):
        raise ApiError(
            "REPOSITORY_PATH_NOT_ALLOWED",
            f"The {label} is outside the configured allowed directories.",
            403,
        )
    if not path.is_dir():
        raise ApiError("INVALID_REPOSITORY", f"The {label} is unavailable.", 400)


def _read_bounded_text(path: Path, limit: int) -> str:
    with path.open("rb") as file:
        contents = file.read(limit + 1)
    if len(contents) > limit:
        raise ValueError("Git metadata file exceeds the allowed size")
    return contents.decode("utf-8")


def _is_within_any(candidate: Path, roots: list[Path]) -> bool:
    return any(_is_within(candidate, root) for root in roots)


def validate_commit_hash(commit_hash: str) -> str:
    """Accept only a hexadecimal object id, never a Git revision expression."""
    if not _COMMIT_HASH.fullmatch(commit_hash):
        raise ApiError("INVALID_COMMIT_HASH", "The commit hash is invalid.", 400)
    return commit_hash


def _is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False
